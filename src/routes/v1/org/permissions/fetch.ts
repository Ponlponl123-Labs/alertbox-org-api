import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";
import { listOrgRolePresets } from "@/classes/org/presets";
import { PERMISSION_DEFINITIONS, SYSTEM_PRESETS } from "@/consts/permission";
import { orgParamsSchema, standardOrgErrors } from "../schemas";

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
      params: orgParamsSchema,
      detail: {
        tags: ["Organization Permissions"],
        summary: "List all permissions and presets",
        description: "Returns the complete permission definition catalog, system role presets, and custom organization presets.",
      },
      response: {
        200: t.Object({
          definitions: t.Any({ description: "Complete dictionary of organization and streamer RBAC permission bitmasks" }),
          presets: t.Array(t.Any(), { description: "System predefined roles and custom organization role presets" }),
        }, { description: "Permission definitions catalog and available role presets" }),
        ...standardOrgErrors,
      },
    },
  );

export default endpoint;
