import { redis } from "@/core/redis";
import { day } from "@/consts/time";

/**
 * Retrieves the full user object from the Redis cache.
 * Since the cache is guaranteed to store the complete user details (profile, widgets, integrations),
 * this function parses and returns the full object directly.
 * 
 * @param uid - The unique user identifier.
 * @returns The cached user object, "deleted" if marked as deleted, or null if cache miss.
 */
export async function getCachedUser(uid: string | bigint): Promise<any | null> {
  const userKey = String(uid);
  const cachedData = await redis.redis.get("user:" + userKey + ":info");
  if (!cachedData) return null;
  if (cachedData === "deleted") return "deleted";

  try {
    const parsed = JSON.parse(cachedData);
    if (parsed && parsed.id != null) {
      parsed.id = BigInt(parsed.id);
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Updates the user identity cache in Redis with strictly pure user scalar attributes.
 * Prevents garbage cache accumulation and stale multi-tenant organizational drift.
 * 
 * @param uid - The unique user identifier.
 * @param user - The user object retrieved from the database or caller.
 * @returns The sanitized pure user identity object.
 */
export async function setCachedUser(uid: string | bigint | number, user: any): Promise<any> {
  const userKey = String(uid);
  const pureUser = {
    id: user.id,
    type: user.type ?? "REGULAR",
    email: user.email,
    name: user.name,
    displayName: user.displayName ?? user.name ?? null,
    avatar: user.avatar ?? null,
    createWith: user.createWith,
    createdAt: user.createdAt,
    disabledAt: user.disabledAt ?? null,
    deletedAt: user.deletedAt ?? null,
  };
  
  await redis.redis.setex(
    "user:" + userKey + ":info",
    day,
    JSON.stringify(pureUser),
  );

  return pureUser;
}

/**
 * Filters the user object in-memory to only include the fields
 * specified by the query selection.
 * 
 * @param user - The user object.
 * @param select - The fields to select.
 * @returns The filtered user object.
 */
export function filterUserSelection(user: any, select: any): any {
  if (!select) return user;

  const filtered: Record<string, any> = { id: user.id };
  for (const key in select) {
    if ((select as any)[key] && key in user) {
      filtered[key] = user[key];
    }
  }
  return filtered;
}
