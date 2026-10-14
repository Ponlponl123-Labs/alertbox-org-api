import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const member = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!member || !hasPermission(member.permissions, OrgPerm.DELETE_ORG)) {
        set.status = "Forbidden";
        return "Insufficient permissions to delete organization";
      }

      await prisma.client.organization.update({
        where: { id: orgId },
        data: { deletedAt: new Date() },
      });

      await redis.redis.del(`user:${String(user.data.id)}:orgs`);

      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Delete organization",
        description: "Soft deletes an organization. Requires DELETE_ORG permission (OWNER only).",
      },
    },
  );

export default endpoint;
