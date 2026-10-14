import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/permissions/presets",
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

      const raw = await redis.redis.get(`org:${String(orgId)}:permissions:presets`);
      const presets = raw ? JSON.parse(raw) : [];

      return presets;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List custom organization permission presets",
      },
    },
  );

export default endpoint;
