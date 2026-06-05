import Elysia, { t } from "elysia";
import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import { ip } from "elysia-ip";

/**
 * GET endpoint to list all devices registered under the currently logged in user session.
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
      const user = await new Me().use(auth, ip);
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      
      return user.devices.list();
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default endpoint;
