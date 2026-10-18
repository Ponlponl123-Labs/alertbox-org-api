import { db } from "@/db";
import { redis } from "@/core/redis";
import { day } from "@/consts/time";
import { MinimalUser } from "@/types/account.types";
import { nanoid } from "nanoid";
import betterConsole, { tsflag } from "ts-better-console";
import { DEFAULT_ALERTBOX_EVENTS } from "@/consts/widget";

/**
 * Create a new user in the database with their primary organization, streamer profile, and widgets.
 */
export async function createAccount(data: {
  name: string;
  email: string;
  createWith: string;
}) {
  const isAccountExist = await isExist(data.email);
  if (isAccountExist) return false;

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const timestamp = Date.now();
    const internalSecret = `${nanoid(32)}.${timestamp}.${nanoid(32)}`;

    try {
      const user = await db.transaction().execute(async (trx) => {
        const now = new Date();
        const insertRes = await trx
          .insertInto("User")
          .values({
            email: data.email,
            name: data.name,
            createWith: data.createWith,
            secret: internalSecret,
            updatedAt: now,
          })
          .executeTakeFirst();

        const newId = insertRes.insertId ? Number(insertRes.insertId) : 0;
        return await trx
          .selectFrom("User")
          .where("id", "=", newId)
          .select([
            "id",
            "type",
            "email",
            "name",
            "avatar",
            "createWith",
            "createdAt",
            "disabledAt",
            "deletedAt",
          ])
          .executeTakeFirst();
      });

      if (!user) throw new Error("Failed to load created user");

      await redis.redis.setex(
        `email:${data.email.trim().toLowerCase()}`,
        day,
        JSON.stringify({
          id: user.id,
          disabledAt: user.disabledAt,
          deletedAt: user.deletedAt,
        }),
      );
      return user;
    } catch (error: any) {
      if (
        error?.code === "ER_DUP_ENTRY" ||
        error?.errno === 1062 ||
        error?.code === "P2002"
      ) {
        const message = String(error?.message || "");
        if (message.includes("email") || message.includes("User_email_key")) {
          return false;
        }

        attempts++;
        betterConsole.warn(
          tsflag(
            "warn",
            true,
            `[Kysely > createAccount] Collision for secret. Retrying...`,
          ),
        );
      } else {
        throw error;
      }
    }
  }

  throw new Error("Failed to create user after multiple attempts.");
}

/**
 * Check if a user exists by email, with caching.
 */
export async function isExist(email: string): Promise<MinimalUser | null> {
  const cleanEmail = email.trim().toLowerCase();
  const cacheKey = `email:${cleanEmail}`;
  const cached = await redis.redis.get(cacheKey);

  if (cached) {
    if (cached === "deleted" || cached === "null") return null;
    try {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.id != null) {
        return {
          id: BigInt(parsed.id),
          disabledAt: parsed.disabledAt ? new Date(parsed.disabledAt) : null,
          deletedAt: parsed.deletedAt ? new Date(parsed.deletedAt) : null,
        };
      }
    } catch {
      await redis.redis.del(cacheKey);
    }
  }

  const user = await db
    .selectFrom("User")
    .where("email", "=", cleanEmail)
    .select(["id", "disabledAt", "deletedAt"])
    .executeTakeFirst();

  if (user?.deletedAt) {
    await redis.redis.setex(cacheKey, day, "deleted");
    return null;
  }

  if (user) {
    await redis.redis.setex(cacheKey, day, JSON.stringify(user));
  } else {
    await redis.redis.setex(cacheKey, 300, "null");
  }

  return user
    ? {
        id: BigInt(user.id),
        disabledAt: user.disabledAt ? new Date(user.disabledAt) : null,
        deletedAt: user.deletedAt ? new Date(user.deletedAt) : null,
      }
    : null;
}

/**
 * Mark a user as deleted, release unique fields (email, secret, profile URI, reserved URIs), and clean up caches.
 */
export async function deleteAccount(uid: string | bigint, email: string) {
  const timestamp = Date.now();
  let userId: bigint;
  try {
    userId = BigInt(uid);
  } catch {
    throw new Error("Invalid user ID");
  }

  const user = await db
    .selectFrom("User")
    .where("id", "=", Number(userId))
    .select(["id", "secret"])
    .executeTakeFirst();

  if (!user) {
    throw new Error("User not found");
  }

  // Fetch streamers where the user is an owner of the organization
  const ownedStreamers = await db
    .selectFrom("OrganizationMember")
    .innerJoin("Streamer", "Streamer.orgId", "OrganizationMember.orgId")
    .where("OrganizationMember.userId", "=", Number(userId))
    .where("OrganizationMember.role", "=", "OWNER")
    .where("OrganizationMember.isDeleted", "is", null)
    .select(["Streamer.id", "Streamer.uri"])
    .execute();

  const streamerIds = ownedStreamers.map((s) => s.id);
  const reservedUris = streamerIds.length > 0
    ? await db
        .selectFrom("ReservedUri")
        .where("streamerId", "in", streamerIds)
        .where("deletedAt", "is", null)
        .select(["id", "uri", "streamerId"])
        .execute()
    : [];

  const deletedEmail = `deleted-${timestamp}-${email}`.slice(0, 256);
  const deletedSecret = `deleted-${timestamp}-${user.secret}`.slice(0, 255);
  const now = new Date();

  await db.transaction().execute(async (trx) => {
    for (const reserved of reservedUris) {
      await trx
        .updateTable("ReservedUri")
        .set({
          uri: `deleted-${timestamp}-${reserved.uri}`.slice(0, 50),
          deletedAt: now,
        })
        .where("id", "=", reserved.id)
        .execute();
    }

    for (const streamer of ownedStreamers) {
      if (streamer.uri) {
        await trx
          .updateTable("Streamer")
          .set({
            uri: `deleted-${timestamp}-${streamer.uri}`.slice(0, 64),
            deletedAt: now,
            updatedAt: now,
          })
          .where("id", "=", streamer.id)
          .execute();
      }
    }

    await trx
      .updateTable("User")
      .set({
        email: deletedEmail,
        secret: deletedSecret,
        deletedAt: now,
        updatedAt: now,
      })
      .where("id", "=", Number(userId))
      .execute();
  });

  // Cleanup Caches
  const cacheCleanup: Promise<any>[] = [
    redis.redis.del(`user:${uid}:info`),
    redis.redis.del(`user:${uid}:orgs`),
    redis.redis.del(`email:${email.trim().toLowerCase()}`),
  ];

  for (const streamer of ownedStreamers) {
    if (streamer.uri) {
      cacheCleanup.push(redis.redis.del(`uri:${streamer.uri.toLowerCase()}:owner`));
    }
  }
  for (const reserved of reservedUris) {
    cacheCleanup.push(redis.redis.del(`uri:${reserved.uri.toLowerCase()}:owner`));
  }

  await Promise.all(cacheCleanup);
  return true;
}

/**
 * Safely self-heals/provisions a default ALERTBOX widget for a streamer if they don't have one.
 */
export async function ensureStreamerWidgets(
  streamerId: string | bigint,
  orgId: string | bigint,
  currentWidgets: any[],
): Promise<any[]> {
  if (currentWidgets && currentWidgets.length > 0) {
    return currentWidgets;
  }

  let targetStreamerId: bigint;
  let targetOrgId: bigint;
  try {
    targetStreamerId = BigInt(streamerId);
    targetOrgId = BigInt(orgId);
  } catch {
    return currentWidgets || [];
  }

  const timestamp = Date.now();
  const widgetToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;
  const now = new Date();

  return await db.transaction().execute(async (trx) => {
    const widgetRes = await trx
      .insertInto("Widget")
      .values({
        orgId: Number(targetOrgId),
        streamerId: Number(targetStreamerId),
        type: "ALERTBOX",
        token: widgetToken,
        updatedAt: now,
      })
      .executeTakeFirst();

    const widgetId = Number(widgetRes.insertId);

    const alertboxRes = await trx
      .insertInto("AlertboxSetting")
      .values({
        widgetId,
        globalVolume: 50,
      })
      .executeTakeFirst();

    const alertboxId = Number(alertboxRes.insertId);

    for (const evt of DEFAULT_ALERTBOX_EVENTS) {
      await trx
        .insertInto("AlertboxEvent")
        .values({
          alertboxId,
          eventType: evt.eventType as any,
          prefix: evt.prefix,
          subfix: evt.subfix,
          messageLayout: evt.messageLayout ?? 0,
          animIn: evt.animIn ?? 0,
          animOut: evt.animOut ?? 1,
          ttsEnabled: evt.ttsEnabled ? 1 : 0,
          updatedAt: now,
        })
        .execute();
    }

    const createdWidget = {
      id: widgetId,
      orgId: Number(targetOrgId),
      streamerId: Number(targetStreamerId),
      type: "ALERTBOX",
      token: widgetToken,
      alertbox: {
        id: alertboxId,
        widgetId,
        globalVolume: 50,
        events: DEFAULT_ALERTBOX_EVENTS,
      },
    };

    return [createdWidget];
  });
}

export async function ensureUserWidgets(userId: string | bigint, currentWidgets: any[]): Promise<any[]> {
  return currentWidgets || [];
}
