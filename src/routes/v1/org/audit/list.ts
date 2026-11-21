import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
import { AUDIT_CACHE_TTL, AUDIT_CATEGORY_ACTIONS } from "@/consts/audit";
import { resolveOrgId } from "@/core/org";

function safeJsonParse(val: string | null): unknown {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/audit",
    async ({ getAuthenticatedUser, params, query, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const callerMember = await db
        .selectFrom("OrganizationMember")
        .select("permissions")
        .where("orgId", "=", Number(orgId))
        .where("userId", "=", Number(user.data.id))
        .where("isDeleted", "is", null)
        .executeTakeFirst();

      if (!callerMember || !hasPermission(BigInt(callerMember.permissions), OrgPerm.ORG_VIEW)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view audit logs";
      }

      const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);
      const offset = Math.max(Number(query.offset || 0), 0);
      const orgIdStr = String(orgId);

      const isUnfiltered =
        !query.action &&
        !query.targetType &&
        (!query.category || query.category === "ALL") &&
        !query.search;
      const entriesKey = `org:${orgIdStr}:audit:entries`;
      const timelineKey = `org:${orgIdStr}:audit:timeline`;
      const metaKey = `org:${orgIdStr}:audit:meta`;

      if (isUnfiltered) {
        const hasTimeline = await redis.redis.exists(timelineKey);
        if (hasTimeline) {
          const [totalRaw, ids] = await Promise.all([
            redis.redis.hget(metaKey, "total"),
            redis.redis.zrevrange(timelineKey, offset, offset + limit - 1),
          ]);
          const total = totalRaw ? parseInt(totalRaw, 10) : await redis.redis.zcard(timelineKey);

          if (ids.length > 0) {
            const rawLogs = await redis.redis.hmget(entriesKey, ...ids);
            if (rawLogs.every(Boolean)) {
              try {
                return {
                  total,
                  limit,
                  offset,
                  logs: rawLogs.map((r: string | null) => JSON.parse(r!)),
                };
              } catch {
                redis.redis.del(timelineKey, entriesKey, metaKey).catch(() => {});
              }
            } else {
              redis.redis.del(timelineKey, entriesKey, metaKey).catch(() => {});
            }
          } else if (total === 0 || offset >= total) {
            return { total, limit, offset, logs: [] };
          }
        }
      }

      let countQuery = db
        .selectFrom("OrganizationAuditLog")
        .innerJoin("User", "User.id", "OrganizationAuditLog.userId")
        .select((eb) => eb.fn.count("OrganizationAuditLog.id").as("count"))
        .where("OrganizationAuditLog.orgId", "=", Number(orgId));

      let logsQuery = db
        .selectFrom("OrganizationAuditLog")
        .innerJoin("User", "User.id", "OrganizationAuditLog.userId")
        .select([
          "OrganizationAuditLog.id as id",
          "OrganizationAuditLog.orgId as orgId",
          "OrganizationAuditLog.action as action",
          "OrganizationAuditLog.targetType as targetType",
          "OrganizationAuditLog.targetId as targetId",
          "OrganizationAuditLog.payload as payload",
          "OrganizationAuditLog.ipAddress as ipAddress",
          "OrganizationAuditLog.createdAt as createdAt",
          "User.id as uId",
          "User.name as uName",
          "User.email as uEmail",
          "User.avatar as uAvatar",
        ])
        .where("OrganizationAuditLog.orgId", "=", Number(orgId));

      if (query.action) {
        countQuery = countQuery.where("OrganizationAuditLog.action", "=", query.action);
        logsQuery = logsQuery.where("OrganizationAuditLog.action", "=", query.action);
      } else if (query.category && query.category !== "ALL") {
        const catActions = AUDIT_CATEGORY_ACTIONS[query.category];
        if (catActions && catActions.length > 0) {
          countQuery = countQuery.where("OrganizationAuditLog.action", "in", catActions);
          logsQuery = logsQuery.where("OrganizationAuditLog.action", "in", catActions);
        }
      }

      if (query.targetType) {
        countQuery = countQuery.where("OrganizationAuditLog.targetType", "=", query.targetType as any);
        logsQuery = logsQuery.where("OrganizationAuditLog.targetType", "=", query.targetType as any);
      }

      if (query.search && query.search.trim()) {
        const s = `%${query.search.trim()}%`;
        const searchFilter = (eb: any) =>
          eb.or([
            eb("OrganizationAuditLog.action", "like", s),
            eb("OrganizationAuditLog.ipAddress", "like", s),
            eb("User.name", "like", s),
            eb("User.email", "like", s),
          ]);
        countQuery = countQuery.where(searchFilter);
        logsQuery = logsQuery.where(searchFilter);
      }

      const [countRow, logs] = await Promise.all([
        countQuery.executeTakeFirst(),
        logsQuery.orderBy("OrganizationAuditLog.createdAt", "desc").limit(limit).offset(offset).execute(),
      ]);

      const total = Number(countRow?.count ?? 0);
      const formattedLogs = logs.map((l) => ({
        id: String(l.id),
        orgId: String(l.orgId),
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId ? String(l.targetId) : null,
        payload: safeJsonParse(l.payload),
        ipAddress: l.ipAddress,
        createdAt: new Date(l.createdAt).toISOString(),
        user: {
          id: String(l.uId),
          name: l.uName,
          email: l.uEmail,
          avatar: l.uAvatar,
        },
      }));

      // Warm Redis cache on miss if unfiltered
      if (isUnfiltered && formattedLogs.length > 0) {
        const pipe = redis.redis.pipeline();
        for (const item of formattedLogs) {
          pipe.hset(entriesKey, item.id, JSON.stringify(item));
          pipe.zadd(timelineKey, new Date(item.createdAt).getTime(), item.id);
        }
        pipe.hset(metaKey, "total", String(total));
        pipe.expire(entriesKey, AUDIT_CACHE_TTL);
        pipe.expire(timelineKey, AUDIT_CACHE_TTL);
        pipe.expire(metaKey, AUDIT_CACHE_TTL);
        pipe.exec().catch(() => {});
      }

      return {
        total,
        limit,
        offset,
        logs: formattedLogs,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get organization audit logs",
        description: "Returns paginated audit log events for the organization. Requires VIEW_ORG permission.",
      },
      query: t.Object({
        action: t.Optional(t.String()),
        category: t.Optional(t.String()),
        search: t.Optional(t.String()),
        targetType: t.Optional(t.Union([t.Literal("MEMBER"), t.Literal("STREAMER"), t.Literal("ORGANIZATION")])),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  );

export default endpoint;
