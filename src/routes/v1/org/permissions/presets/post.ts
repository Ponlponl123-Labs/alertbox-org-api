import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId } from "@/core/org";
import { nanoid } from "nanoid";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/permissions/presets",
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

      const cleanName = body.name.trim();
      if (!cleanName) {
        set.status = "Bad Request";
        return "Preset name cannot be empty";
      }

      const raw = await redis.redis.get(`org:${String(orgId)}:permissions:presets`);
      const existing: any[] = raw ? JSON.parse(raw) : [];

      const newPreset = {
        id: nanoid(10),
        name: cleanName,
        description: body.description?.trim() || null,
        color: body.color || "text-primary",
        permissions: body.permissions,
        createdAt: new Date().toISOString(),
      };

      existing.push(newPreset);
      await redis.redis.set(`org:${String(orgId)}:permissions:presets`, JSON.stringify(existing));

      return newPreset;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Create custom permission preset",
        description: "Creates an organization-specific permission preset. Requires MANAGE_ROLES.",
      },
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 64 }),
        description: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
        color: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
        permissions: t.String(),
      }),
    },
  );

export default endpoint;
