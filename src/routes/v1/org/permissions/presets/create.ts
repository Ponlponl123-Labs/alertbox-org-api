import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";
import { createOrgRolePreset } from "@/classes/org/presets";
import { orgParamsSchema, standardOrgErrors } from "../../schemas";

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

      if (authRes.role !== "OWNER" && authRes.role !== "ADMIN") {
        if ((perms & ~authRes.permissions) !== 0n) {
          set.status = "Forbidden";
          return "Cannot grant permissions that exceed your own";
        }
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
      params: orgParamsSchema,
      detail: {
        tags: ["Organization Permissions"],
        summary: "Create custom permission preset",
        description: "Creates an organization-specific permission preset. Requires MANAGE_ROLES.",
      },
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 64, description: "Preset name", examples: ["Content Editor"] }),
        description: t.Optional(t.Nullable(t.String({ maxLength: 255, description: "Description of assigned capabilities" }))),
        color: t.Optional(t.Nullable(t.String({ maxLength: 255, description: "UI color tag class", examples: ["text-primary"] }))),
        permissions: t.String({ description: "Permission bitmask as numeric string", examples: ["65535"] }),
      }),
      response: {
        200: t.Object({
          id: t.String({ description: "Generated preset UUID" }),
          name: t.String(),
          description: t.Nullable(t.String()),
          color: t.Nullable(t.String()),
          permissions: t.String(),
        }, { description: "Created custom permission preset" }),
        ...standardOrgErrors,
      },
    },
  );

export default endpoint;
