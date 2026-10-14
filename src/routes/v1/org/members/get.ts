import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/members",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const callerMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.VIEW_ORG)) {
        set.status = "Forbidden";
        return "Access denied";
      }

      const [org, members] = await Promise.all([
        prisma.client.organization.findUnique({
          where: { id: orgId },
          include: {
            streamers: {
              where: { deletedAt: null },
              select: { id: true, name: true, displayName: true, avatar: true },
            },
          },
        }),
        prisma.client.organizationMember.findMany({
          where: { orgId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                avatar: true,
                disabledAt: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      const allStreamers = (org?.streamers || []).map((s) => ({
        id: String(s.id),
        name: s.name,
        displayName: s.displayName,
        avatar: s.avatar,
      }));

      return members.map((m) => ({
        id: String(m.id),
        userId: String(m.userId),
        email: m.user.email,
        name: m.user.name,
        avatar: m.user.avatar,
        role: m.role,
        status: m.user.disabledAt ? "Offline" : "Active",
        permissions: m.permissions.toString(),
        joinedAt: m.createdAt,
        streamers: allStreamers,
      }));
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List organization members",
        description: "Returns all members of an organization with roles and bitmask permissions.",
      },
    },
  );

export default endpoint;
