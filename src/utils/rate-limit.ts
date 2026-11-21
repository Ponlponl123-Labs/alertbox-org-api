import { redis } from "@/core/redis";

const FALLBACK_MAX_ENTRIES = 2000;
const fallbackWindows = new Map<string, { count: number; resetAt: number }>();

function pruneFallback(now: number): void {
  for (const [k, v] of fallbackWindows) {
    if (v.resetAt <= now) fallbackWindows.delete(k);
  }
  while (fallbackWindows.size >= FALLBACK_MAX_ENTRIES) {
    const oldest = fallbackWindows.keys().next().value;
    if (!oldest) break;
    fallbackWindows.delete(oldest);
  }
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSec: number,
): Promise<{ allowed: boolean; remaining: number; retryAfterSec: number }> {
  const redisKey = `rl:${key}`;

  if (redis.redis.status === "ready") {
    try {
      const count = await redis.redis.incr(redisKey);
      if (count === 1) {
        await redis.redis.expire(redisKey, windowSec);
      }
      if (count > maxRequests) {
        const ttl = await redis.redis.ttl(redisKey);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSec: ttl > 0 ? ttl : windowSec,
        };
      }
      return {
        allowed: true,
        remaining: Math.max(0, maxRequests - count),
        retryAfterSec: 0,
      };
    } catch {
      // Fall through to in-memory window on transient Redis failure
    }
  }

  const now = Date.now();
  const windowMs = windowSec * 1000;
  let entry = fallbackWindows.get(key);
  if (!entry || entry.resetAt <= now) {
    if (fallbackWindows.size >= FALLBACK_MAX_ENTRIES) pruneFallback(now);
    entry = { count: 1, resetAt: now + windowMs };
    fallbackWindows.set(key, entry);
    return { allowed: true, remaining: maxRequests - 1, retryAfterSec: 0 };
  }

  entry.count += 1;
  if (entry.count > maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
    };
  }
  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - entry.count),
    retryAfterSec: 0,
  };
}
