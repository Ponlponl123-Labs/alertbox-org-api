import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { sessionUserSelect } from "@/consts/session";

/**
 * GET endpoint to retrieve the currently logged in user's profile info.
 */
export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser(sessionUserSelect);
      return user.toJSON();
    },
    {
      detail: {
        tags: ["User Account"],
        summary: "Get authenticated user details",
        description:
          "Fetches the complete profile, settings, and widget list for the currently logged-in user. Use this on initial app bootstrap to hydrate the user context.",
        responses: {
          200: {
            description: "Current user profile data.",
          },
        },
      },
    },
  );

export default endpoint;
