import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";

/**
 * Endpoint to handle user session destruction (logout).
 * Expects a Bearer token in the Authorization header.
 */
export const endpoint = new Elysia().delete(
  "/",
  async ({ headers, set }) => {
    const auth = isBearerToken(headers.authorization);
    if (!auth) {
      set.status = "Bad Request";
      return "Bad Request";
    }
    const r = await Me.destroySession(auth);
    if (!r) {
      set.status = "Unauthorized";
      return "Unauthorized";
    }
    return "OK";
  },
  {
    headers: t.Object({
      authorization: t.String(),
    }),
  },
);

export default endpoint;
