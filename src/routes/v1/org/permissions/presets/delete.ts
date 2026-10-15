import Elysia from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm } from "@/utils/rbac";
import { authorizeOrg } from "@/core/org";
import { deleteOrgRolePreset } from "@/classes/org/presets";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/permissions/presets/:presetId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_ROLES_MANAGE, set, "manage roles and presets");
      if (typeof authRes === "string") return authRes;

      await deleteOrgRolePreset(authRes.orgId, params.presetId);

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
