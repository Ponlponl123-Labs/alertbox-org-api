import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";

/**
 * Endpoint to handle user session destruction (logout).
 */
export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser();
      await user.session.destroy();
      return "OK";
    },
    {
      detail: {
        tags: ["Authentication"],
        summary: "Sign out and revoke session",
        description:
          "Terminates the current authenticated session. Wipes the session token from Redis and marks it revoked in MariaDB so it cannot be used again.",
      },
      response: {
        200: t.String({
          description: "Session successfully destroyed.",
          examples: ["OK"],
        }),
      },
    },
  );

export default endpoint;
