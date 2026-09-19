import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { sessionUserSelect } from "@/consts/session";

/**
 * DELETE endpoint to delete the currently logged in user's account.
 */
export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser(sessionUserSelect);
      await user.delete();
      return "OK, Goodbye!";
    },
    {
      detail: {
        tags: ["User Account"],
        summary: "Permanently delete account",
        description:
          "Wipes all user records, disconnects active payment integrations, frees registered custom URIs, deletes widget data, and invalidates all session tokens. This action cannot be reversed.",
      },
      response: {
        200: t.String({
          description: "Account deletion confirmation message.",
          examples: ["OK, Goodbye!"],
        }),
      },
    },
  );

export default endpoint;
