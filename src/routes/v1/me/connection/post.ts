import Elysia, { t } from "elysia";
import {
  allowed_user_update_providers,
  resolveProvider,
} from "@/classes/me/connections";
import { auth } from "@/core/auth";

/**
 * POST endpoint to connect/set integration configuration for a provider.
 */
export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:provider",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const provider = resolveProvider(params.provider ?? "");
      if (!provider || !allowed_user_update_providers.includes(provider)) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      if (provider === "kofi" || provider === "buymeacoffee") {
        if (typeof body === "string" || !body.username || !body.secret) {
          set.status = "Bad Request";
          return "Username and secret are required for this provider";
        }
      }

      const user = await getAuthenticatedUser();
      await user.connections.set(provider, body);
      return "OK";
    },
    {
      params: t.Object({
        provider: t.String(),
      }),
      body: t.Union([
        t.String(),
        t.Object({
          username: t.String(),
          secret: t.String(),
        }),
      ]),
    },
  );

export default endpoint;
