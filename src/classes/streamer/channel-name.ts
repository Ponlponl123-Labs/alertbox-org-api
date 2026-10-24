import { db } from "@/db";
import { redis } from "@/core/redis";
import { reserved_uri } from "@/consts/reserved";
import { week } from "@/consts/time";

export type ChannelNameStatus = "available" | "taken" | "reserved" | "invalid";

export class ChannelNameRegistry {
  private static readonly CACHE_PREFIX = "streamer:username:";
  private static readonly NOONE_SENTINEL = "noone";

  /**
   * Fast Redis cache-first lookup to check if a streamer channel username is taken or reserved.
   * Ignores deletedAt to enforce strict global uniqueness across the entire DB forever.
   */
  public static async checkAvailability(rawName: string): Promise<{
    available: boolean;
    status: ChannelNameStatus;
    ownerId?: string;
  }> {
    const name = rawName.trim().toLowerCase();

    if (!name || name.length > 64 || !/^[a-z0-9_-]+$/.test(name)) {
      return { available: false, status: "invalid" };
    }

    if (reserved_uri.has(name)) {
      return { available: false, status: "reserved" };
    }

    const cacheKey = `${this.CACHE_PREFIX}${name}:owner`;
    const cached = await redis.redis.get(cacheKey);

    if (cached) {
      if (cached === this.NOONE_SENTINEL) {
        return { available: true, status: "available" };
      }
      return { available: false, status: "taken", ownerId: cached };
    }

    // Cache miss -> Query DB without deletedAt check (strictly single unique across entire DB)
    const existing = await db
      .selectFrom("Streamer")
      .select("id")
      .where("name", "=", name)
      .executeTakeFirst();

    if (existing) {
      const ownerId = String(existing.id);
      void redis.redis.setex(cacheKey, week, ownerId);
      return { available: false, status: "taken", ownerId };
    }

    // Negative caching to prevent cache stampede
    void redis.redis.setex(cacheKey, week, this.NOONE_SENTINEL);
    return { available: true, status: "available" };
  }

  /**
   * Claim streamer channel username in Redis cache upon successful DB insert/update.
   */
  public static async claim(name: string, streamerId: bigint | string | number): Promise<void> {
    const parsed = name.trim().toLowerCase();
    const cacheKey = `${this.CACHE_PREFIX}${parsed}:owner`;
    await redis.redis.setex(cacheKey, week, String(streamerId));
  }

  /**
   * Release streamer channel username cache if renamed or rolled back.
   */
  public static async invalidate(name: string): Promise<void> {
    const parsed = name.trim().toLowerCase();
    await redis.redis.del(`${this.CACHE_PREFIX}${parsed}:owner`);
  }
}
