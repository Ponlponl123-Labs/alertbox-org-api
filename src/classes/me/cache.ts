import { redis } from "@/index";
import { day } from "@/consts/time";
import { Prisma } from "@/generated/prisma/client";

/**
 * Get a user from Redis cache and validate it has all requested fields.
 */
export async function getCachedUser(uid: string, select: Prisma.UserSelect): Promise<any | null> {
  const c = await redis.redis.get("user:" + uid + ":info");
  if (!c) return null;
  if (c === "deleted") return "deleted";

  const cached = JSON.parse(c);
  const hasAllFields = Object.keys(select).every(
    (key) => !(select as any)[key] || key in cached,
  );

  return hasAllFields ? cached : null;
}

/**
 * Update the user "Master Cache" in Redis.
 * Always excludes sensitive auth secret.
 */
export async function setCachedUser(uid: string, user: any) {
  const { secret, ...cacheableUser } = user;
  await redis.redis.setex(
    "user:" + uid + ":info",
    day,
    JSON.stringify(cacheableUser),
  );

  const profile = user.profile;
  if (profile?.uri)
    await redis.redis.setex("user:" + uid + ":uri", day, profile.uri);
  if (profile?.uriCooldownEnd)
    await redis.redis.setex(
      "user:" + uid + ":uri_cooldown",
      day,
      String(profile.uriCooldownEnd.getTime ? profile.uriCooldownEnd.getTime() : profile.uriCooldownEnd),
    );
  
  return cacheableUser;
}

/**
 * Helper to filter user data based on a Prisma select object.
 * Always ensures the ID is included.
 */
export function filterUserSelection(user: any, select: Prisma.UserSelect) {
  const filtered = Object.keys(select).reduce((acc, key) => {
    if ((select as any)[key]) acc[key] = (user as any)[key];
    return acc;
  }, {} as any);
  filtered.id = user.id;
  return filtered;
}
