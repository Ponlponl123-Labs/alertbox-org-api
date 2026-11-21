import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";
import { listOrgRolePresets } from "@/classes/org/presets";
import { orgParamsSchema, standardOrgErrors } from "../../schemas";

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
      params: orgParamsSchema,
      detail: {
        tags: ["Organization Permissions"],
        summary: "List custom organization permission presets",
      },
      response: {
        200: t.Array(
          t.Object({
            id: t.String({ description: "Preset UUID", examples: ["c4b1e840-02c3-4d7a-bfa1-e63d6b0521e1"] }),
            name: t.String({ description: "Preset title", examples: ["Moderator"] }),
            description: t.Nullable(t.String({ description: "Preset explanation" })),
            color: t.Nullable(t.String({ description: "UI badge color class" })),
            permissions: t.String({ description: "Bitmask permissions value" }),
          }),
          { description: "List of custom organization permission presets" },
        ),
        ...standardOrgErrors,
      },
    },
  );

export default endpoint;
