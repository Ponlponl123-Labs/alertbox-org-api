import { db } from "@/db";
import { redis } from "@/core/redis";
import { isValidUri } from "@/utils/regex";
import { allowed_social } from "@/consts/regex";
import { week } from "@/consts/time";
import { processAvatar, processBanner } from "@/utils/image";
import { saveProfileImage, deleteProfileImage } from "@/utils/storage";
import { nanoid } from "nanoid";
import betterConsole, { tsflag } from "ts-better-console";
import { inflateSync } from "zlib";
import { hexColorToNumber } from "@/utils/color";
import { updateStreamerCache } from "@/utils/cache-sync";

/**
 * Update streamer profile data and/or media assets.
 */
export async function updateProfile(
  streamerId: string | bigint,
  currentData: { avatar?: string | null; banner?: string | null },
  payload: {
    displayName?: string;
    name?: string;
    bio?: string | null;
    accentColor?: string | null;
    socialDiscord?: string | null;
    socialFacebook?: string | null;
    socialReddit?: string | null;
    socialTwitch?: string | null;
    socialTwitter?: string | null;
    socialYoutube?: string | null;
    avatar?: File;
    banner?: File;
  },
) {
  const data: any = {};

  const displayNameVal = payload.displayName || payload.name;
  if (displayNameVal) data.displayName = displayNameVal.trim().slice(0, 64);
  if (payload.name) data.name = payload.name.trim().slice(0, 64);
  if (payload.bio !== undefined) data.bio = payload.bio ? payload.bio.trim().slice(0, 1000) : null;
  if (payload.accentColor !== undefined) {
    data.accentColor = payload.accentColor ? hexColorToNumber(payload.accentColor) : 0;
  }

  const socialMap: Record<string, string> = {
    socialDiscord: "discord",
    socialFacebook: "facebook",
    socialReddit: "reddit",
    socialTwitch: "twitch",
    socialTwitter: "twitter",
    socialYoutube: "youtube",
  };

  for (const [key, field] of Object.entries(socialMap)) {
    if ((payload as any)[key] !== undefined) {
      const raw = (payload as any)[key];
      if (raw && typeof raw === "string") {
        const trimmed = raw.trim();
        data[field] = allowed_social.test(trimmed) ? trimmed.slice(0, 64) : null;
      } else {
        data[field] = null;
      }
    }
  }

  if (payload.avatar && typeof payload.avatar.arrayBuffer === "function") {
    try {
      const buffer = Buffer.from(await payload.avatar.arrayBuffer());
      const processed = await processAvatar(buffer);
      const { url } = await saveProfileImage(String(streamerId), "avatar", nanoid(), processed.buffer);
      if (currentData?.avatar) {
        await deleteProfileImage(currentData.avatar).catch(() => {});
      }
      data.avatar = url;
    } catch {}
  }

  if (payload.banner && typeof payload.banner.arrayBuffer === "function") {
    try {
      const buffer = Buffer.from(await payload.banner.arrayBuffer());
      const processed = await processBanner(buffer);
      const { url } = await saveProfileImage(String(streamerId), "banner", nanoid(), processed.buffer);
      if (currentData?.banner) {
        await deleteProfileImage(currentData.banner).catch(() => {});
      }
      data.banner = url;

      if (payload.accentColor === undefined) {
        try {
          const onePixelPng = await new Bun.Image(processed.buffer)
            .resize(1, 1)
            .png()
            .bytes();
          let idatOffset = -1;
          for (let i = 0; i < onePixelPng.length - 4; i++) {
            if (
              onePixelPng[i] === 0x49 &&
              onePixelPng[i + 1] === 0x44 &&
              onePixelPng[i + 2] === 0x41 &&
              onePixelPng[i + 3] === 0x54
            ) {
              idatOffset = i;
              break;
            }
          }
          if (idatOffset !== -1) {
            const length =
              (onePixelPng[idatOffset - 4] << 24) |
              (onePixelPng[idatOffset - 3] << 16) |
              (onePixelPng[idatOffset - 2] << 8) |
              onePixelPng[idatOffset - 1];
            const compressedData = onePixelPng.slice(idatOffset + 4, idatOffset + 4 + length);
            const decompressed = inflateSync(compressedData);
            if (decompressed.length >= 4) {
              const r = decompressed[1];
              const g = decompressed[2];
              const b = decompressed[3];
              data.accentColor = (r << 16) + (g << 8) + b;
            }
          }
        } catch {}
      }
    } catch {}
  }

  let targetStreamerId: bigint;
  try {
    targetStreamerId = BigInt(streamerId);
  } catch {
    return null;
  }

  const targetId = Number(targetStreamerId);
  await db
    .updateTable("Streamer")
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where("id", "=", targetId)
    .execute();

  const updated = await db
    .selectFrom("Streamer")
    .selectAll()
    .where("id", "=", targetId)
    .executeTakeFirst();

  if (!updated) return null;

  await updateStreamerCache({
    id: updated.id,
    orgId: updated.orgId,
    name: updated.name,
    displayName: updated.displayName,
    bio: updated.bio,
    avatar: updated.avatar,
    banner: updated.banner,
    accentColor: updated.accentColor,
    twitch: updated.twitch,
    youtube: updated.youtube,
    twitter: updated.twitter,
    facebook: updated.facebook,
    reddit: updated.reddit,
    discord: updated.discord,
    uri: updated.uri,
  });

  return updated;
}

/**
 * Register a new URI for a streamer channel.
 */
export async function registerURI(
  streamerId: string | bigint,
  uri: string,
  token: string,
): Promise<boolean> {
  const parsedUri = uri.trim().toLowerCase();
  if (!isValidUri(parsedUri)) return false;

  const cachedOwner = await redis.redis.get(`uri:${parsedUri}:owner`);
  if (cachedOwner && cachedOwner !== "noone") return false;

  const existingRecord = await db
    .selectFrom("ReservedUri")
    .select(["streamerId", "disabledAt"])
    .where("uri", "=", parsedUri)
    .executeTakeFirst();

  if (existingRecord) {
    const status = existingRecord.disabledAt ? "disabled" : String(existingRecord.streamerId);
    void redis.redis.setex(`uri:${parsedUri}:owner`, week, status);
    return false;
  }

  let targetStreamerId: bigint;
  try {
    targetStreamerId = BigInt(streamerId);
  } catch {
    return false;
  }

  const cooldownDate = new Date(Date.now() + week);
  const targetId = Number(targetStreamerId);

  try {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("ReservedUri")
        .values({
          uri: parsedUri,
          streamerId: targetId,
          reservedByToken: token,
        })
        .execute();

      await trx
        .updateTable("Streamer")
        .set({
          uri: parsedUri,
          uriCooldownEnd: cooldownDate,
          updatedAt: new Date(),
        })
        .where("id", "=", targetId)
        .execute();
    });

    const now = Date.now();
    await Promise.all([
      redis.redis.setex(`uri:${parsedUri}:owner`, week, String(streamerId)),
      redis.redis.setex(`uri:${parsedUri}:registered_date`, week, String(now)),
      redis.redis.setex(`streamer:${String(streamerId)}:uri`, week, parsedUri),
      redis.redis.setex(`streamer:${String(streamerId)}:uri_cooldown`, week, String(cooldownDate.getTime())),
      redis.redis.del(`streamer:${String(streamerId)}:info`),
    ]);

    return true;
  } catch (err) {
    betterConsole.error(tsflag("error", true, `[Streamer > registerURI] Failed for Streamer ${streamerId}, URI ${parsedUri}: ${err}`));
    return false;
  }
}

/**
 * Find the owner streamer ID of a given URI.
 */
export async function getURIOwner(uri: string): Promise<string | false> {
  const parsedUri = uri.trim().toLowerCase();

  const cached = await redis.redis.get(`uri:${parsedUri}:owner`);
  if (cached === "noone" || cached === "disabled") return false;
  if (cached) {
    try {
      BigInt(cached);
      return cached;
    } catch {
      await redis.redis.del(`uri:${parsedUri}:owner`);
    }
  }

  const lastRecord = await db
    .selectFrom("ReservedUri")
    .select(["createdAt", "streamerId", "disabledAt"])
    .where("uri", "=", parsedUri)
    .executeTakeFirst();

  if (!lastRecord) {
    void redis.redis.setex(`uri:${parsedUri}:owner`, week, "noone");
    return false;
  }

  const status = lastRecord.disabledAt ? "disabled" : String(lastRecord.streamerId);

  await Promise.all([
    redis.redis.setex(`uri:${parsedUri}:owner`, week, status),
    redis.redis.setex(`uri:${parsedUri}:registered_date`, week, String(new Date(lastRecord.createdAt).getTime())),
  ]);

  return lastRecord.disabledAt ? false : String(lastRecord.streamerId);
}
