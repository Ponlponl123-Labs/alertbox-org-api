import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
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

      const callerMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.ORG_VIEW)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view audit logs";
      }

      const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);
      const offset = Math.max(Number(query.offset || 0), 0);
      const where: any = { orgId };

      if (query.action) {
        where.action = query.action;
      }
      if (query.targetType) {
        where.targetType = query.targetType;
      }

      const [total, logs] = await Promise.all([
        prisma.client.organizationAuditLog.count({ where }),
        prisma.client.organizationAuditLog.findMany({
          where,
          select: {
            id: true,
            orgId: true,
            action: true,
            targetType: true,
            targetId: true,
            payload: true,
            ipAddress: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
      ]);

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
          createdAt: l.createdAt.toISOString(),
          user: {
            id: String(l.user.id),
            name: l.user.name,
            email: l.user.email,
            avatar: l.user.avatar,
          },
        })),
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
        targetType: t.Optional(t.Union([t.Literal("MEMBER"), t.Literal("STREAMER"), t.Literal("ORGANIZATION")])),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  );

export default endpoint;
