import { useSession } from "@/utils/account/session";
import { isBearerToken } from "@/utils/bearer-token";
import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";

export const router = new Elysia({ prefix: "me" }).use(ip()).get(
  "/",
  async ({ headers, set, ip }) => {
    const auth = isBearerToken(headers.authorization);
    if (!auth) {
      set.status = "Bad Request";
      return "Bad Request";
    }
    const me = await useSession(auth, ip);
    if (!me) {
      set.status = "Unauthorized";
      return "Unauthorized";
    }
    return me;
  },
  {
    headers: t.Object({
      authorization: t.String(),
    }),
  },
);

export default router;
