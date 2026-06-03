import Elysia, { t } from "elysia";
import { endpoint as DiscordAuthEndpoint } from "./discord";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";

export const router = new Elysia({ prefix: "auth" })
  .use(DiscordAuthEndpoint)
  .delete(
    "/",
    async ({ headers, set, ip }) => {
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

export default router;
