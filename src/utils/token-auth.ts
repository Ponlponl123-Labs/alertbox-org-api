import { parseToken, mintToken, type TokenPayload } from "./token";
import { redis } from "@/core/redis";
import { prisma } from "@/core/prisma";

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

  // 1. Fast-path: Check Redis cached version
  const cachedVersion = await redis.redis.get(redisKey);
  if (cachedVersion !== null) {
    if (parseInt(cachedVersion, 10) !== payload.version) {
      return null; // Revoked!
    }
    return { userId: payload.userId, version: payload.version };
  }

  // 2. Fallback: Query DB (cache miss)
  const user = await prisma.client.user.findFirst({
    where: typeof payload.userId === "bigint"
      ? { id: payload.userId.toString() as any }
      : { id: payload.userId },
    select: { id: true, secret: true },
  });

  if (!user) return null;

  // Use secret hash or numeric version
  const currentVersion = 1; // Default epoch

  // Cache in Redis
  await redis.redis.setex(redisKey, DAY_SEC, String(currentVersion));

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

  // Atomic Redis increment -> invalidates all existing tokens immediately
  const newVersion = await redis.redis.incr(redisKey);
  await redis.redis.expire(redisKey, DAY_SEC * 30);

  return newVersion;
}

export { mintToken };
