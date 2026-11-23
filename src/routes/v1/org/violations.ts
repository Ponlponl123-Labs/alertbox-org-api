import Elysia from "elysia";
import { auth } from "@/core/auth";
import { authorizeOrg } from "@/core/org";
import { OrgPerm } from "@/consts/permission";
import { ViolationTargetType } from "@/db/enums";
import { getTargetViolations, violationResponseSchema } from "@/utils/violation";
import { orgParamsSchema, standardOrgErrors } from "./schemas";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/violations",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const ctx = await authorizeOrg(
        params.orgId,
        BigInt(user.data.id),
        OrgPerm.ORG_VIEW,
        set,
        "view organization violations",
        { allowOnViolation: true },
      );
      if (typeof ctx === "string") return ctx;

      return getTargetViolations(ViolationTargetType.ORG, ctx.orgId);
    },
    {
      params: orgParamsSchema,
      response: {
        200: violationResponseSchema,
        ...standardOrgErrors,
      },
      detail: {
        tags: ["Organization"],
        summary: "Get organization violations",
        description: "Returns the highest violation level and list of violations for the specified organization.",
      },
    },
  );

export default endpoint;
