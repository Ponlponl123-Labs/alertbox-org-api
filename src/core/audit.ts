import { db } from "@/db";
import { redis } from "@/core/redis";
import type { LogOrgAuditParams } from "@/types";
import { AUDIT_CACHE_TTL } from "@/consts/audit";

export async function logOrgAudit(params: LogOrgAuditParams) {
  try {
    const insertRes = await db
      .insertInto("OrganizationAuditLog")
      .values({
        orgId: Number(params.orgId),
        userId: Number(params.userId),
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId ? Number(params.targetId) : null,
        payload: params.payload ? JSON.stringify(params.payload) : null,
        ipAddress: params.ipAddress || "127.0.0.1",
      })
      .executeTakeFirst();

    const logId = insertRes.insertId ? String(insertRes.insertId) : String(Date.now());
    const createdAt = new Date();

    const user = await db
      .selectFrom("User")
      .where("id", "=", Number(params.userId))
      .select(["id", "name", "email", "avatar"])
      .executeTakeFirst();

    // Write-through to Redis Hash and Timeline (zero cache invalidation / cache bust)
    const orgIdStr = String(params.orgId);
    const entriesKey = `org:${orgIdStr}:audit:entries`;
    const timelineKey = `org:${orgIdStr}:audit:timeline`;
    const metaKey = `org:${orgIdStr}:audit:meta`;

    const logItem = {
      id: logId,
      orgId: orgIdStr,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ? String(params.targetId) : null,
      payload: params.payload ?? null,
      ipAddress: params.ipAddress || "127.0.0.1",
      createdAt: createdAt.toISOString(),
      user: {
        id: String(user?.id ?? params.userId),
        name: user?.name ?? null,
        email: user?.email ?? "",
        avatar: user?.avatar ?? null,
      },
    };

    const hasTimeline = await redis.redis.exists(timelineKey);
    if (hasTimeline) {
      await redis.redis
        .pipeline()
        .hset(entriesKey, logId, JSON.stringify(logItem))
        .zadd(timelineKey, createdAt.getTime(), logId)
        .hincrby(metaKey, "total", 1)
        .expire(entriesKey, AUDIT_CACHE_TTL)
        .expire(timelineKey, AUDIT_CACHE_TTL)
        .expire(metaKey, AUDIT_CACHE_TTL)
        .exec();
    }
  } catch (err) {
    // Non-blocking log failure
    console.error("[AuditLog] Failed to record event:", err);
  }
}
