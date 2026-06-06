import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";
import { setConnection } from "@/classes/me/connections";

export const endpoint = new Elysia().use(ip()).post(
  "/",
  async ({ headers, set, ip, body }) => {
    const auth = isBearerToken(headers.authorization);
    if (!auth) {
      set.status = "Bad Request";
      return "Bad Request";
    }
    const user = await new Me().use(auth, ip, basicUserSelect);
    if (!user || !user.data) {
      set.status = "Unauthorized";
      return "Unauthorized";
    }

    await setConnection(user.data.id, "streamlabs", body);

    return "OK";
  },
  {
    headers: t.Object({
      authorization: t.String(),
    }),
    body: t.String(),
  },
);

export default endpoint;
