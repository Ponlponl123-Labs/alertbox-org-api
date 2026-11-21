import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { buildSessionCookieHeader } from "@/utils/bearer-token";

/**
 * Endpoint to handle user session destruction (logout).
 */
export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/",
    async ({ getAuthenticatedUser, set }) => {
      const user = await getAuthenticatedUser();
      await user.session.destroy();
      set.headers["Set-Cookie"] = buildSessionCookieHeader("", true);
      set.headers["Cache-Control"] = "no-store";
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
