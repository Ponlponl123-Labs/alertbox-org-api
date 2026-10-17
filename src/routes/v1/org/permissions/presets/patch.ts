import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";
import { updateOrgRolePreset } from "@/classes/org/presets";

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
