import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";
import { removeConnection } from "@/classes/me/connections";

export const endpoint = new Elysia().use(ip()).delete(
  "/",
  async ({ headers, set, ip }) => {
    const auth = isBearerToken(headers.authorization);
    if (!auth) {
      set.status = "Bad Request";
      return "Bad Request";
    }
    const user = await new Me({ cache: false }).use(auth, ip, basicUserSelect);
    if (!user || !user.data) {
      set.status = "Unauthorized";
      return "Unauthorized";
    }

    await removeConnection(user.data.id, "streamlabs");

    return "OK";
  },
  {
    headers: t.Object({
      authorization: t.String(),
    }),
  },
);

export default endpoint;
