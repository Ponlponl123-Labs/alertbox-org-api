import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/invites",
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

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.ORG_MEMBER_ADD)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view invites";
      }

      const invites = await prisma.client.organizationInvite.findMany({
        where: { orgId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });

      return invites.map((inv) => ({
        id: String(inv.id),
        email: inv.email,
        role: inv.role,
        permissions: inv.permissions.toString(),
        token: inv.token,
        code: inv.token,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      }));
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List pending organization invites",
        description: "Returns active, unaccepted invitations for the organization.",
      },
    },
  );

export default endpoint;
