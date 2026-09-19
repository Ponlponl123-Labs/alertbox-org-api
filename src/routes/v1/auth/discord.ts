import Elysia, { t } from "elysia";

import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { exchange_code, get_me, revoke_access_token } from "@/utils/discord";
import { isAllowedOrigin } from "@/utils/security";

const endpoint = new Elysia().use(ip({ headersFirst: true })).post(
  "/discord",
  async ({ body, set, server, request, ip }) => {
    const redirectUrl = (() => {
      try {
        return new URL(body.redirect_uri);
      } catch {
        return null;
      }
    })();

    if (!redirectUrl || !isAllowedOrigin(redirectUrl.origin)) {
      set.status = "Bad Request";
      return "Invalid or unauthorized redirect_uri";
    }

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
        createWith: "discord",
      });
      if (!created) {
        set.status = "Conflict";
        return "That user already exist";
      }
    } else {
      await user.load(exist_user.id);
    }

    const session = await user.session.create({
      ipAddress: ip,
      method: request.method,
      userAgent: request.headers.get("user-agent") || "Unknown",
    });

    if (!session) {
      set.status = "Conflict";
      return "User have corrupted data";
    }

    void revoke_access_token(access_token.token);
    return session;
  },
  {
    detail: {
      tags: ["Authentication"],
      summary: "Exchange Discord OAuth2 code for session",
      description:
        "Handles the OAuth2 callback from Discord. Takes the authorization `code` from the redirect query, verifies that the user's email is verified on Discord, creates or signs into their account, generates a session token, and immediately revokes the temporary Discord access token.",
      responses: {
        200: {
          description: "Authenticated session created successfully.",
        },
        400: {
          description: "Invalid or unauthorized redirect_uri.",
        },
        401: {
          description: "Unauthorized or failed code exchange.",
        },
        406: {
          description: "Discord email is not verified.",
        },
      },
    },
    body: t.Object(
      {
        code: t.String({
          description:
            "The authorization code returned by Discord in the `?code=` query param.",
          examples: ["mXv97s8dF72k1LmP0qWzYa"],
        }),
        redirect_uri: t.String({
          description:
            "The exact redirect URI configured in your Discord Developer portal.",
          examples: ["https://alertbox.org/auth/callback"],
        }),
      },
      {
        description: "Discord authorization credentials",
        examples: [
          {
            code: "mXv97s8dF72k1LmP0qWzYa",
            redirect_uri: "https://alertbox.org/auth/callback",
          },
        ],
      },
    ),
  },
);

export { endpoint };
