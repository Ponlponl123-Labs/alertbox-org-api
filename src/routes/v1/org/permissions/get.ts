import Elysia from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";
import { listOrgRolePresets } from "@/classes/org/presets";
import { PERMISSION_DEFINITIONS, SYSTEM_PRESETS } from "@/consts/permission";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/permissions",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_VIEW, set, "view organization");
      if (typeof authRes === "string") return authRes;
      const { orgId } = authRes;

      const customPresets = await listOrgRolePresets(orgId);

      return {
        definitions: PERMISSION_DEFINITIONS,
        presets: [...SYSTEM_PRESETS, ...customPresets],
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List all permissions and presets",
        description: "Returns the complete permission definition catalog, system role presets, and custom organization presets.",
      },
    },
  );
