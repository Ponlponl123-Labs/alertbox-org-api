import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm } from "@/utils/rbac";
import { authorizeOrg } from "@/core/org";
import { createOrgRolePreset } from "@/classes/org/presets";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/permissions/presets",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_ROLES_MANAGE, set, "manage roles and presets");
      if (typeof authRes === "string") return authRes;
      const { orgId } = authRes;

      const cleanName = body.name.trim();
      if (!cleanName) {
        set.status = "Bad Request";
        return "Preset name cannot be empty";
      }

      let perms = 0n;
      try {
        perms = BigInt(body.permissions) & ~OrgPerm.ORG_DELETE;
      } catch {
        set.status = "Bad Request";
        return "Invalid permissions bitmask";
      }

      const newPreset = await createOrgRolePreset(orgId, {
        name: cleanName,
        description: body.description?.trim() || null,
        color: body.color || "text-primary",
        permissions: perms,
      });

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
