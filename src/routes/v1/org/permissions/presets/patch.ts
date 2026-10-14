import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/:orgId/permissions/presets/:presetId",
    async ({ getAuthenticatedUser, params, body, set }) => {
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
      if (!raw) {
        set.status = "Not Found";
        return "Preset not found";
      }

      const existing: any[] = JSON.parse(raw);
      const index = existing.findIndex((p) => p.id === params.presetId);
      if (index === -1) {
        set.status = "Not Found";
        return "Preset not found";
      }

      const current = existing[index];
      const updated = {
        ...current,
        name: body.name !== undefined ? body.name.trim() : current.name,
        description: body.description !== undefined ? body.description?.trim() || null : current.description,
        color: body.color !== undefined ? body.color || "text-primary" : current.color,
        permissions: body.permissions !== undefined ? body.permissions : current.permissions,
        updatedAt: new Date().toISOString(),
      };

      existing[index] = updated;
      await redis.redis.set(`org:${String(orgId)}:permissions:presets`, JSON.stringify(existing));

      return updated;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Update custom permission preset",
        description: "Updates an existing custom preset. Requires MANAGE_ROLES.",
      },
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
        description: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
        color: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
        permissions: t.Optional(t.String()),
      }),
    },
  );

export default endpoint;
