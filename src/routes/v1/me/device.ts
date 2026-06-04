import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";

const endpoint = new Elysia({ prefix: "/device" })
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
  )
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

export { endpoint };
