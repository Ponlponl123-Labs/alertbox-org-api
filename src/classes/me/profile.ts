import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { isValidUri } from "@/utils/regex";
import { week } from "@/consts/time";
import { processAvatar, processBanner } from "@/utils/image";
import { saveProfileImage, deleteProfileImage } from "@/utils/storage";
import { nanoid } from "nanoid";
import { setCachedUser } from "./cache";
import betterConsole, { tsflag } from "ts-better-console";
import { inflateSync } from "zlib";
import { hexColorToNumber } from "@/utils/color";

/**
 * Update user profile data and/or images.
 */
export async function updateProfile(
  uid: string,
  currentData: { avatar?: string | null; banner?: string | null },
  payload: {
    displayname?: string;
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

  // Text Fields
  if (payload.displayname) data.displayName = payload.displayname.trim().slice(0, 64);
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
      data[field] = (payload as any)[key] ? (payload as any)[key].trim().slice(0, 512) : null;
    }
  }

  // Image Processing
  if (payload.avatar) {
    const buffer = Buffer.from(await payload.avatar.arrayBuffer());
    const processed = await processAvatar(buffer);
    const { url } = await saveProfileImage(uid, "avatar", nanoid(), processed.buffer);
    if (currentData.avatar) await deleteProfileImage(currentData.avatar).catch((err) => betterConsole.error(tsflag("error", true, `Failed to delete old avatar: ${err}`)));
    data.avatar = url;
  }

  if (payload.banner) {
    const buffer = Buffer.from(await payload.banner.arrayBuffer());
    const processed = await processBanner(buffer);
    const { url } = await saveProfileImage(uid, "banner", nanoid(), processed.buffer);
    if (currentData.banner) await deleteProfileImage(currentData.banner).catch((err) => betterConsole.error(tsflag("error", true, `Failed to delete old banner: ${err}`)));
    data.banner = url;

    // Automatically extract dominant/average color from the banner as the accent color
    try {
      const onePixelPng = await new Bun.Image(processed.buffer)
        .resize(1, 1)
        .png()
        .bytes();

      // Find the IDAT chunk
      let idatOffset = -1;
      for (let i = 0; i < onePixelPng.length - 4; i++) {
        if (
          onePixelPng[i] === 0x49 && // I
          onePixelPng[i + 1] === 0x44 && // D
          onePixelPng[i + 2] === 0x41 && // A
          onePixelPng[i + 3] === 0x54    // T
        ) {
          idatOffset = i;
          break;
        }
      }

      if (idatOffset !== -1) {
        const view = new DataView(onePixelPng.buffer, onePixelPng.byteOffset, onePixelPng.byteLength);
        const idatLength = view.getUint32(idatOffset - 4, false);
        const compressedData = onePixelPng.subarray(idatOffset + 4, idatOffset + 4 + idatLength);
        const decompressed = inflateSync(compressedData);
        if (decompressed.length >= 4) {
          const r = decompressed[1];
          const g = decompressed[2];
          const b = decompressed[3];
          data.accentColor = (r << 16) + (g << 8) + b;
        }
      }
    } catch (e) {
      betterConsole.error(tsflag("error", true, `Failed to extract banner accent color: ${e}`));
    }
  }

  if (Object.keys(data).length === 0) return null;

  const updated = await prisma.client.profile.update({
    data,
    where: { userId: uid },
  });

  // Invalidate Redis cache
  await redis.redis.del(`user:${uid}:info`);

  // Sync Cache - fetch the full user (including integration) to maintain cache completeness
  const fullUser = await prisma.client.user.findUnique({
    where: { id: uid },
    include: {
      profile: true,
      integration: true,
      widgets: {
        include: {
          alertbox: {
            include: {
              events: true,
            },
          },
        },
      },
    },
  });
  if (fullUser) await setCachedUser(uid, fullUser);

  return updated;
}

/**
 * Register a new URI for a user.
 */
export async function registerURI(
  uid: string,
  uri: string,
  token: string,
): Promise<boolean> {
  const parsedUri = uri.trim().toLowerCase();
  if (!isValidUri(parsedUri)) return false;

  const cachedOwner = await redis.redis.get(`uri:${parsedUri}:owner`);
  if (cachedOwner && cachedOwner !== "noone") return false;

  const existingRecord = await prisma.client.reservedUri.findFirst({
    select: { userId: true, disabledAt: true },
    where: { uri: parsedUri },
    orderBy: { createdAt: "desc" },
  });

  if (existingRecord) {
    const status = existingRecord.disabledAt ? "disabled" : existingRecord.userId;
    void redis.redis.setex(`uri:${parsedUri}:owner`, week, status);
    return false;
  }

  const cooldownDate = new Date(Date.now() + week);

  try {
    await prisma.client.$transaction(async (tx) => {
      await tx.reservedUri.create({
        data: {
          uri: parsedUri,
          userId: uid,
          reservedByToken: token,
        },
      });

      await tx.profile.update({
        data: {
          uri: parsedUri,
          uriCooldownEnd: cooldownDate,
        },
        where: { userId: uid },
      });
    });

    const now = Date.now();
    await Promise.all([
      redis.redis.setex(`uri:${parsedUri}:owner`, week, uid),
      redis.redis.setex(`uri:${parsedUri}:registered_date`, week, String(now)),
      redis.redis.setex(`user:${uid}:uri`, week, parsedUri),
      redis.redis.setex(`user:${uid}:uri_cooldown`, week, String(cooldownDate.getTime())),
      redis.redis.del(`user:${uid}:info`), 
    ]);

    return true;
  } catch (err) {
    betterConsole.error(tsflag("error", true, `[Profile > registerURI] Failed for UID ${uid}, URI ${parsedUri}: ${err}`));
    return false;
  }
}

/**
 * Find the owner UID of a given URI.
 */
export async function getURIOwner(uri: string): Promise<string | false> {
  const parsedUri = uri.trim().toLowerCase();
  
  const cached = await redis.redis.get(`uri:${parsedUri}:owner`);
  if (cached === "noone" || cached === "disabled") return false;
  if (cached) return cached;

  const lastRecord = await prisma.client.reservedUri.findFirst({
    select: { createdAt: true, userId: true, disabledAt: true },
    where: { uri: parsedUri },
    orderBy: { createdAt: "desc" },
  });

  if (!lastRecord) {
    void redis.redis.setex(`uri:${parsedUri}:owner`, week, "noone");
    return false;
  }

  const status = lastRecord.disabledAt ? "disabled" : lastRecord.userId;
  
  await Promise.all([
    redis.redis.setex(`uri:${parsedUri}:owner`, week, status),
    redis.redis.setex(`uri:${parsedUri}:registered_date`, week, String(lastRecord.createdAt.getTime())),
  ]);

  return lastRecord.disabledAt ? false : lastRecord.userId;
}
