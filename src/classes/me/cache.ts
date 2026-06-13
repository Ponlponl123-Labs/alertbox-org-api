import { redis } from "@/core/redis";
import { day } from "@/consts/time";
import { Prisma } from "@/generated/prisma/client";

/**
 * Retrieves the full user object from the Redis cache.
 * Since the cache is guaranteed to store the complete user details (profile, widgets, integrations),
 * this function parses and returns the full object directly.
 * 
 * @param uid - The unique user identifier.
 * @returns The cached user object, "deleted" if marked as deleted, or null if cache miss.
 */
export async function getCachedUser(uid: string): Promise<any | null> {
  const cachedData = await redis.redis.get("user:" + uid + ":info");
  if (!cachedData) return null;
  if (cachedData === "deleted") return "deleted";

  try {
    return JSON.parse(cachedData);
  } catch {
    return null;
  }
}

/**
 * Updates the user master cache in Redis with the complete user object.
 * Extracts and sets separate URI mapping values in Redis for rapid public routing.
 * 
 * @param uid - The unique user identifier.
 * @param user - The complete user object retrieved from the database.
 * @returns The sanitized user object without the authentication secret.
 */
export async function setCachedUser(uid: string, user: any): Promise<any> {
  const { secret, ...cacheableUser } = user;
  
  await redis.redis.setex(
    "user:" + uid + ":info",
    day,
    JSON.stringify(cacheableUser),
  );

  const profile = user.profile;
  if (profile?.uri) {
    await redis.redis.setex("user:" + uid + ":uri", day, profile.uri);
  }
  if (profile?.uriCooldownEnd) {
    const cooldownMs = profile.uriCooldownEnd.getTime 
      ? profile.uriCooldownEnd.getTime() 
      : new Date(profile.uriCooldownEnd).getTime();
    await redis.redis.setex(
      "user:" + uid + ":uri_cooldown",
      day,
      String(cooldownMs),
    );
  }

  return cacheableUser;
}

/**
 * Filters the complete cached user object in-memory to only include the fields
 * specified by the query selection.
 * 
 * @param user - The complete cached user object.
 * @param select - The fields to select.
 * @returns The filtered user object.
 */
export function filterUserSelection(user: any, select: Prisma.UserSelect): any {
  if (!select) return user;
  
  const filtered = Object.keys(select).reduce((acc, key) => {
    if ((select as any)[key]) {
      acc[key] = (user as any)[key];
    }
    return acc;
  }, {} as any);
  
  filtered.id = user.id;
  return filtered;
}
