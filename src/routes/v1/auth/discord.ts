import { createAccount, isExist } from "@/utils/account/me";
import { createSession } from "@/utils/account/session";
import { exchange_code, get_me, revoke_access_token } from "@/utils/discord";
import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";

const endpoint = new Elysia().use(ip()).post(
  "/discord",
  async ({ body, set, server, request, ip }) => {
    const access_token = await exchange_code(body.code, body.redirect_uri);
    if (!access_token) {
      set.status = "Unauthorized";
      return "Unauthorized, cannot be exchange code";
    }
    const me = await get_me(access_token);
    if (!me || !me.email) {
      set.status = "Unauthorized";
      return "Unauthorized";
    }
    if (!me.verified) {
      set.status = "Not Acceptable";
      return "User email isn't verified";
    }
    let userid;
    const exist_user = await isExist(me.email);
    if (!exist_user) {
      const user = await createAccount(me.username, me.email);
      if (!user) {
        set.status = "Conflict";
        return "That user already exist";
      }
      userid = user.id;
    } else {
      userid = exist_user.id;
    }
    const session = await createSession(userid, {
      ip_addr: server?.requestIP(request)?.address || ip,
      method: request.method,
      user_agent: request.headers.get("user-agent") || "Unknown",
    });
    if (!session) {
      set.status = "Conflict";
      return "User have corrupted data";
    }
    void revoke_access_token(access_token.token);
    return session;
  },
  {
    body: t.Object({
      code: t.String(),
      redirect_uri: t.String(),
    }),
  },
);

export { endpoint };
