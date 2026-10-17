import Elysia from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";
import { listOrgRolePresets } from "@/classes/org/presets";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/permissions/presets",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_VIEW, set, "view organization");
      if (typeof authRes === "string") return authRes;

      return listOrgRolePresets(authRes.orgId);
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List custom organization permission presets",
      },
    },
  );

export default endpoint;
