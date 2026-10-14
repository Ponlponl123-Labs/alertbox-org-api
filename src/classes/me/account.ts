import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { day } from "@/consts/time";
import { MinimalUser } from "@/types/account.types";
import { nanoid } from "nanoid";
import betterConsole, { tsflag } from "ts-better-console";
import { DEFAULT_ALERTBOX_EVENTS } from "@/consts/widget";

import { OrgPerm } from "@/utils/rbac";
import { fullUserSelect } from "@/consts/session";

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
    const widgetToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;
    const orgSlug = `${data.name.toLowerCase().replace(/[^a-z0-9]/g, "") || "org"}-${nanoid(6)}`;

    try {
      const user = await prisma.client.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: {
            email: data.email,
            name: data.name,
            createWith: data.createWith,
            secret: internalSecret,
          },
        });

        const org = await tx.organization.create({
          data: {
            ownerId: newUser.id,
            name: `${data.name}'s Org`,
            slug: orgSlug,
            members: {
              create: {
                userId: newUser.id,
                role: "OWNER",
                permissions: OrgPerm.ALL,
              },
            },
          },
        });

        await tx.streamer.create({
          data: {
            orgId: org.id,
            name: data.name,
            displayName: data.name,
            widgets: {
              create: {
                orgId: org.id,
                type: "ALERTBOX",
                token: widgetToken,
                alertbox: {
                  create: {
                    events: {
                      createMany: {
                        data: DEFAULT_ALERTBOX_EVENTS,
                      },
                    },
                  },
                },
              },
            },
            integration: {
              create: {
                orgId: org.id,
              },
            },
          },
        });

        return await tx.user.findUnique({
          where: { id: newUser.id },
          select: fullUserSelect,
        });
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
      if (error?.code === "P2002") {
        const target = error?.meta?.target;
        const isEmailCollision = Array.isArray(target)
          ? target.includes("email")
          : typeof target === "string"
          ? target.includes("email")
          : false;

        if (isEmailCollision) {
          return false;
        }

        attempts++;
        betterConsole.warn(
          tsflag(
            "warn",
            true,
            `[Prisma > createAccount] Collision for secret/widget token. Retrying...`,
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
          ...parsed,
          id: BigInt(parsed.id),
        };
      }
    } catch {
      await redis.redis.del(cacheKey);
    }
  }

  const user = await prisma.client.user.findUnique({
    select: {
      id: true,
      disabledAt: true,
      deletedAt: true,
    },
    where: {
      email: cleanEmail,
    },
  });

  if (user?.deletedAt) {
    await redis.redis.setex(cacheKey, day, "deleted");
    return null;
  }

  if (user) {
    await redis.redis.setex(cacheKey, day, JSON.stringify(user));
  } else {
    await redis.redis.setex(cacheKey, 300, "null");
  }

  return user;
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

  const user = await prisma.client.user.findUnique({
    where: { id: userId },
    include: {
      memberships: {
        include: {
          organization: {
            include: {
              streamers: {
                include: {
                  reservedUris: {
                    where: { deletedAt: null },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const deletedEmail = `deleted-${timestamp}-${email}`.slice(0, 256);
  const deletedSecret = `deleted-${timestamp}-${user.secret}`.slice(0, 255);

  const updated = await prisma.client.$transaction(async (tx) => {
    // Release active reserved URIs by suffixing them and marking as deleted
    for (const membership of user.memberships) {
      if (membership.role === "OWNER") {
        for (const streamer of membership.organization.streamers) {
          for (const reserved of streamer.reservedUris) {
            await tx.reservedUri.update({
              where: { id: reserved.id },
              data: {
                uri: `deleted-${timestamp}-${reserved.uri}`.slice(0, 50),
                deletedAt: new Date(),
              },
            });
          }
          if (streamer.uri) {
            await tx.streamer.update({
              where: { id: streamer.id },
              data: {
                uri: `deleted-${timestamp}-${streamer.uri}`.slice(0, 64),
                deletedAt: new Date(),
              },
            });
          }
        }
      }
    }

    return await tx.user.update({
      where: { id: userId },
      data: {
        email: deletedEmail,
        secret: deletedSecret,
        deletedAt: new Date(),
      },
    });
  });

  // Cleanup Caches
  const cacheCleanup: Promise<any>[] = [
    redis.redis.del(`user:${uid}:info`),
    redis.redis.del(`user:${uid}:orgs`),
    redis.redis.del(`email:${email.trim().toLowerCase()}`),
  ];

  for (const membership of user.memberships) {
    if (membership.role === "OWNER") {
      for (const streamer of membership.organization.streamers) {
        if (streamer.uri) {
          cacheCleanup.push(redis.redis.del(`uri:${streamer.uri.toLowerCase()}:owner`));
        }
        for (const reserved of streamer.reservedUris) {
          cacheCleanup.push(redis.redis.del(`uri:${reserved.uri.toLowerCase()}:owner`));
        }
      }
    }
  }

  await Promise.all(cacheCleanup);

  return updated;
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

  const createdWidget = await prisma.client.widget.create({
    data: {
      orgId: targetOrgId,
      streamerId: targetStreamerId,
      type: "ALERTBOX",
      token: widgetToken,
      alertbox: {
        create: {
          events: {
            createMany: {
              data: DEFAULT_ALERTBOX_EVENTS,
            },
          },
        },
      },
    },
    include: {
      alertbox: {
        include: {
          events: true,
        },
      },
    },
  });

  return [createdWidget];
}

export async function ensureUserWidgets(userId: string | bigint, currentWidgets: any[]): Promise<any[]> {
  return currentWidgets || [];
}
