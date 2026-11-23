import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { ViolationTargetType } from "@/db/enums";
import { getTargetViolations, violationResponseSchema } from "@/utils/violation";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/violations",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser();
      return getTargetViolations(ViolationTargetType.USER, user.data.id);
    },
    {
      response: {
        200: violationResponseSchema,
        401: t.String({ description: "Unauthorized: Missing or invalid session token" }),
      },
      detail: {
        tags: ["User Account"],
        summary: "Get authenticated user violations",
        description: "Returns the highest violation level and list of violations for the authenticated user account.",
      },
    },
  );

export default endpoint;
