import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
import { resolveOrgId, resolveStreamerId } from "@/core/org";

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
    "/:orgId/streamers/:streamerId/audit",
    async ({ getAuthenticatedUser, params, query, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }
      const streamerId = await resolveStreamerId(orgId, params.streamerId);
      if (!streamerId) {
        set.status = "Bad Request";
        return "Invalid streamer ID";
      }

      const callerMember = await db
        .selectFrom("OrganizationMember")
        .select(["permissions"])
        .where("orgId", "=", Number(orgId))
        .where("userId", "=", Number(user.data.id))
        .executeTakeFirst();

      if (!callerMember || !hasPermission(BigInt(callerMember.permissions), OrgPerm.STREAMER_VIEW)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view streamer audit logs";
      }

      const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);
      const offset = Math.max(Number(query.offset || 0), 0);

      let countQuery = db
        .selectFrom("OrganizationAuditLog")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("orgId", "=", Number(orgId))
        .where("targetType", "=", "STREAMER")
        .where("targetId", "=", Number(streamerId));

      let logsQuery = db
        .selectFrom("OrganizationAuditLog")
        .innerJoin("User", "User.id", "OrganizationAuditLog.userId")
        .select([
          "OrganizationAuditLog.id",
          "OrganizationAuditLog.orgId",
          "OrganizationAuditLog.action",
          "OrganizationAuditLog.targetType",
          "OrganizationAuditLog.targetId",
          "OrganizationAuditLog.payload",
          "OrganizationAuditLog.ipAddress",
          "OrganizationAuditLog.createdAt",
          "User.id as uId",
          "User.name as uName",
          "User.email as uEmail",
          "User.avatar as uAvatar",
        ])
        .where("OrganizationAuditLog.orgId", "=", Number(orgId))
        .where("OrganizationAuditLog.targetType", "=", "STREAMER")
        .where("OrganizationAuditLog.targetId", "=", Number(streamerId));

      if (query.action) {
        countQuery = countQuery.where("OrganizationAuditLog.action", "=", query.action);
        logsQuery = logsQuery.where("OrganizationAuditLog.action", "=", query.action);
      }

      const [countRow, logs] = await Promise.all([
        countQuery.executeTakeFirst(),
        logsQuery.orderBy("OrganizationAuditLog.createdAt", "desc").limit(limit).offset(offset).execute(),
      ]);

      const total = Number(countRow?.count ?? 0);

      return {
        total,
        limit,
        offset,
        logs: logs.map((l) => ({
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
        })),
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get streamer channel audit logs",
        description: "Returns audit events scoped to a specific streamer channel. Requires VIEW_STREAMERS.",
      },
      query: t.Object({
        action: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  );

export default endpoint;
