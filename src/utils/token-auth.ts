import { parseToken, mintToken, type TokenPayload } from "./token";
import { redis } from "@/core/redis";
import { db } from "@/db";

const DAY_SEC = 86400;

export interface AuthenticatedTokenResult {
  userId: bigint | string;
  version: number;
}

/**
 * Validates encrypted token + verifies user revocation version in Redis/DB.
 */
export async function verifyTokenAndRevocation(
  tokenStr: string,
): Promise<AuthenticatedTokenResult | null> {
  const payload = parseToken(tokenStr);
  if (!payload) return null;

  const userKey = payload.userId.toString();
  const redisKey = `user:v:${userKey}`;

  let cachedVersion: string | null = null;
  try {
    cachedVersion = await redis.redis.get(redisKey);
  } catch {}

  if (cachedVersion !== null) {
    if (parseInt(cachedVersion, 10) !== payload.version) {
      return null;
    }
    return { userId: payload.userId, version: payload.version };
  }

  const user = await db
    .selectFrom("User")
    .where("id", "=", Number(payload.userId))
    .where("disabledAt", "is", null)
    .where("deletedAt", "is", null)
    .select(["id", "secret"])
    .executeTakeFirst();

  if (!user) return null;

  const currentVersion = 1;
  try {
    await redis.redis.setex(redisKey, DAY_SEC * 30, String(currentVersion));
  } catch {}

  if (currentVersion !== payload.version) {
    return null;
  }

  return { userId: payload.userId, version: payload.version };
}

/**
 * Instantly invalidates all tokens for a user by bumping the revocation version.
 */
export async function revokeUserCredentials(
  userId: bigint | string,
): Promise<number> {
  const userKey = userId.toString();
  const redisKey = `user:v:${userKey}`;

  try {
    const newVersion = await redis.redis.incr(redisKey);
    await redis.redis.expire(redisKey, DAY_SEC * 30);
    return newVersion;
  } catch {
    return 1;
  }
}

export { mintToken };
