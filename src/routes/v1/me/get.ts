import Elysia, { t } from "elysia";
import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import { sessionUserSelect } from "@/consts/session";
import { ip } from "elysia-ip";

/**
 * GET endpoint to retrieve the currently logged in user's profile info.
 */
export const endpoint = new Elysia()
  .use(ip())
  .get(
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
      return user.toJSON();
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default endpoint;
