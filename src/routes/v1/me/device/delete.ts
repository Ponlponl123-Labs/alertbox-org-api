import Elysia, { t } from "elysia";
import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import { ip } from "elysia-ip";

/**
 * DELETE endpoint to destroy a registered device.
 */
export const endpoint = new Elysia()
  .use(ip())
  .delete(
    "/:id",
    async ({ headers, set, ip, params }) => {
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
      
      const success = await user.devices.destroy(params.id);
      if (!success) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      
      return "OK";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
      params: t.Object({
        id: t.String(),
      }),
    },
  );

export default endpoint;
