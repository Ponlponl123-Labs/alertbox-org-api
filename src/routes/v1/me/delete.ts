import Elysia, { t } from "elysia";
import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import { sessionUserSelect } from "@/consts/session";
import { ip } from "elysia-ip";

/**
 * DELETE endpoint to delete the currently logged in user's account.
 */
export const endpoint = new Elysia()
  .use(ip())
  .delete(
    "/",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me().use(auth, ip, sessionUserSelect);
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      await user.delete();

      return "OK, Goodbye!";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default endpoint;
