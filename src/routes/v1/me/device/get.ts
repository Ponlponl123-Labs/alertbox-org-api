import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";

/**
 * GET endpoint to list all devices registered under the currently logged in user session.
 */
export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser();
      return user.devices.list();
    },
    {
      detail: {
        tags: ["User Security"],
        summary: "List active login sessions & devices",
        description:
          "Returns all currently authenticated devices and active sessions for the user (including IP address, user-agent, creation date, and whether it represents the current session).",
      },
      response: {
        200: t.Array(
          t.Any(),
          { description: "List of active user devices and sessions." },
        ),
      },
    },
  );

export default endpoint;
