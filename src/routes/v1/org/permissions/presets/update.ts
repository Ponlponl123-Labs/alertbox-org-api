import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";
import { updateOrgRolePreset } from "@/classes/org/presets";
import { orgPresetParamsSchema, standardOrgErrors } from "../../schemas";

export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/:orgId/permissions/presets/:presetId",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_ROLES_MANAGE, set, "manage roles and presets");
      if (typeof authRes === "string") return authRes;
      const { orgId } = authRes;

      let perms: bigint | undefined;
      if (body.permissions !== undefined) {
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
      }

      try {
        const updated = await updateOrgRolePreset(orgId, params.presetId, {
          name: body.name,
          description: body.description,
          color: body.color,
          permissions: perms,
        });
        return updated;
      } catch {
        set.status = "Not Found";
        return "Preset not found";
      }
    },
    {
      params: orgPresetParamsSchema,
      detail: {
        tags: ["Organization Permissions"],
        summary: "Update custom permission preset",
        description: "Updates an existing custom preset. Requires MANAGE_ROLES.",
      },
      body: t.Object({
        name: t.Optional(t.String({ minLength: 1, maxLength: 64, description: "Preset name" })),
        description: t.Optional(t.Nullable(t.String({ maxLength: 255, description: "Preset description" }))),
        color: t.Optional(t.Nullable(t.String({ maxLength: 255, description: "UI badge color class" }))),
        permissions: t.Optional(t.String({ description: "Permission bitmask as numeric string" })),
      }),
      response: {
        200: t.Object({
          id: t.String({ description: "Preset UUID" }),
          name: t.String(),
          description: t.Nullable(t.String()),
          color: t.Nullable(t.String()),
          permissions: t.String(),
        }, { description: "Updated custom permission preset" }),
        ...standardOrgErrors,
      },
    },
  );

export default endpoint;
