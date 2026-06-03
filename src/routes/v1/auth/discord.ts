import { Me } from "@/classes/me";
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
    const discordMe = await get_me(access_token);
    if (!discordMe || !discordMe.email) {
      set.status = "Unauthorized";
      return "Unauthorized";
    }
    if (!discordMe.verified) {
      set.status = "Not Acceptable";
      return "User email isn't verified";
    }

    const user = new Me();
    const exist_user = await Me.isExist(discordMe.email);

    if (!exist_user) {
      const created = await user.create({
        name: discordMe.username,
        email: discordMe.email,
        create_with: "discord",
      });
      if (!created) {
        set.status = "Conflict";
        return "That user already exist";
      }
    } else {
      await user.load(exist_user.id);
    }

    const session = await user.session.create({
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
