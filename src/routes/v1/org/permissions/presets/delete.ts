import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/permissions/presets/:presetId",
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

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.MANAGE_ROLES)) {
        set.status = "Forbidden";
        return "Insufficient permissions to manage roles and presets";
      }

      const raw = await redis.redis.get(`org:${String(orgId)}:permissions:presets`);
      if (!raw) return "OK";

      const existing: any[] = JSON.parse(raw);
      const filtered = existing.filter((p) => p.id !== params.presetId);

      await redis.redis.set(`org:${String(orgId)}:permissions:presets`, JSON.stringify(filtered));

      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Delete custom permission preset",
        description: "Removes a custom preset for the organization. Requires MANAGE_ROLES.",
      },
    },
  );

export default endpoint;
