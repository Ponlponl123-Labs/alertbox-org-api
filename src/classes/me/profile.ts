import { prisma, redis } from "@/index";
import { isValidUri } from "@/utils/regex";
import { week } from "@/consts/time";
import { processAvatar, processBanner } from "@/utils/image";
import { saveProfileImage, deleteProfileImage } from "@/utils/storage";
import { nanoid } from "nanoid";
import { setCachedUser } from "./cache";

/**
 * Update user profile data and/or images.
 */
export async function updateProfile(
  uid: bigint,
  currentData: { avatar?: string | null; banner?: string | null },
  payload: {
    displayname?: string;
    bio?: string | null;
    social_discord?: string | null;
    social_facebook?: string | null;
    social_reddit?: string | null;
    social_twitchtv?: string | null;
    social_twitter?: string | null;
    social_youtube?: string | null;
    avatar?: File;
    banner?: File;
  },
) {
  const data: any = {};

  // Text Fields
  if (payload.displayname) data.displayname = payload.displayname.trim().slice(0, 64);
  if (payload.bio !== undefined) data.bio = payload.bio ? payload.bio.trim().slice(0, 1000) : null;
  
  const socialFields = [
    "social_discord",
    "social_facebook",
    "social_reddit",
    "social_twitchtv",
    "social_twitter",
    "social_youtube",
  ];
  
  for (const field of socialFields) {
    if ((payload as any)[field] !== undefined) {
      data[field] = (payload as any)[field] ? (payload as any)[field].trim().slice(0, 512) : null;
    }
  }

  // Image Processing
  if (payload.avatar) {
    const buffer = Buffer.from(await payload.avatar.arrayBuffer());
    const processed = await processAvatar(buffer);
    const { url } = await saveProfileImage(String(uid), "avatar", nanoid(), processed.buffer);
    if (currentData.avatar) await deleteProfileImage(currentData.avatar).catch(console.error);
    data.avatar = url;
  }

  if (payload.banner) {
    const buffer = Buffer.from(await payload.banner.arrayBuffer());
    const processed = await processBanner(buffer);
    const { url } = await saveProfileImage(String(uid), "banner", nanoid(), processed.buffer);
    if (currentData.banner) await deleteProfileImage(currentData.banner).catch(console.error);
    data.banner = url;
  }

  if (Object.keys(data).length === 0) return null;

  const updated = await prisma.client.accounts.update({
    data,
    where: { id: uid },
  });

  // Sync Cache
  await setCachedUser(uid, updated);

  return updated;
}

/**
 * Register a new URI for a user.
 * Performs validation, availability checks, and atomic database updates.
 */
export async function registerURI(
  uid: bigint,
  uri: string,
  token: string,
): Promise<boolean> {
  const parsedUri = uri.trim().toLowerCase();
  if (!isValidUri(parsedUri)) return false;

  // 1. Fast Cache Check
  const cachedOwner = await redis.redis.get(`uri:${parsedUri}:owner`);
  if (cachedOwner && cachedOwner !== "noone") {
    return false;
  }

  // 2. Database Check (Ensure it hasn't been taken since cache was set)
  const existingRecord = await prisma.client.reserved_uri.findFirst({
    select: { uid: true, disabled: true },
    where: { uri: parsedUri },
    orderBy: { id: "desc" },
  });

  if (existingRecord) {
    const status = existingRecord.disabled ? "disabled" : String(existingRecord.uid);
    void redis.redis.setex(`uri:${parsedUri}:owner`, week, status);
    return false;
  }

  const cooldownDate = new Date(Date.now() + week);

  try {
    // 3. Atomic Transaction
    await prisma.client.$transaction(async (tx) => {
      await tx.reserved_uri.create({
        data: {
          uri: parsedUri,
          uid,
          by: token,
        },
      });

      await tx.accounts.update({
        data: {
          uri: parsedUri,
          uri_cooldown: cooldownDate,
        },
        where: { id: uid },
      });
    });

    // 4. Update Cache
    const now = Date.now();
    await Promise.all([
      redis.redis.setex(`uri:${parsedUri}:owner`, week, String(uid)),
      redis.redis.setex(`uri:${parsedUri}:registered_date`, week, String(now)),
      redis.redis.setex(`user:${uid}:uri`, week, parsedUri),
      redis.redis.setex(`user:${uid}:uri_cooldown`, week, String(cooldownDate.getTime())),
      redis.redis.del(`user:${uid}:info`), // Invalidate master cache
    ]);

    return true;
  } catch (err) {
    console.error(`[Profile > registerURI] Failed for UID ${uid}, URI ${parsedUri}:`, err);
    return false;
  }
}

/**
 * Find the owner UID of a given URI.
 */
export async function getURIOwner(uri: string): Promise<bigint | false> {
  const parsedUri = uri.trim().toLowerCase();
  
  // 1. Cache Lookup
  const cached = await redis.redis.get(`uri:${parsedUri}:owner`);
  if (cached === "noone" || cached === "disabled") return false;
  if (cached) {
    try {
      return BigInt(cached);
    } catch {
      // Corrupted cache, fallback to DB
    }
  }

  // 2. Database Lookup
  const lastRecord = await prisma.client.reserved_uri.findFirst({
    select: { time: true, uid: true, disabled: true },
    where: { uri: parsedUri },
    orderBy: { id: "desc" },
  });

  if (!lastRecord) {
    void redis.redis.setex(`uri:${parsedUri}:owner`, week, "noone");
    return false;
  }

  const status = lastRecord.disabled ? "disabled" : String(lastRecord.uid);
  
  // Update cache with fresh DB info
  await Promise.all([
    redis.redis.setex(`uri:${parsedUri}:owner`, week, status),
    redis.redis.setex(`uri:${parsedUri}:registered_date`, week, String(lastRecord.time.getTime())),
  ]);

  return lastRecord.disabled ? false : lastRecord.uid;
}
