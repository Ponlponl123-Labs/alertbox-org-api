import Elysia, { t } from "elysia";
import {
  allowed_user_update_providers,
  resolveProvider,
} from "@/classes/me/connections";
import { auth } from "@/core/auth";

/**
 * DELETE endpoint to remove integration configuration for a provider.
 */
export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:provider",
    async ({ getAuthenticatedUser, params, set }) => {
      const provider = resolveProvider(params.provider ?? "");
      if (!provider || !allowed_user_update_providers.includes(provider)) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      const user = await getAuthenticatedUser();
      await user.connections.remove(provider);
      return "OK";
    },
    {
      detail: {
        tags: ["Payment Connections"],
        summary: "Disconnect a payment provider",
        description:
          "Removes stored credentials and integration configuration for the given provider. Supported `:provider` values: `stripe`, `kofi`, `buymeacoffee`, `feelfreepay`. Future webhook events from this provider will no longer trigger alerts.",
      },
      params: t.Object({
        provider: t.String({
          description: "Provider identifier or alias to disconnect.",
          examples: ["kofi"],
        }),
      }),
      response: {
        200: t.String({
          description: "Provider disconnected successfully.",
          examples: ["OK"],
        }),
      },
    },
  );

export default endpoint;
