import Elysia, { t } from "elysia";
import {
  allowed_user_update_providers,
  resolveProvider,
  removeConnection,
} from "@/classes/streamer";
import { orgContext, requireOrgPermission } from "@/core/org";
import { OrgPerm } from "@/consts/permission";

/**
 * DELETE endpoint to remove integration configuration for a provider.
 */
export const endpoint = new Elysia()
  .use(orgContext)
  .delete(
    "/:provider",
    async ({ org, params, set }) => {
      if (!org) {
        set.status = "Forbidden";
        return "No active organization found";
      }
      if (!requireOrgPermission(org, OrgPerm.INTEGRATION_MANAGE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to manage integrations";
      }

      const provider = resolveProvider(params.provider ?? "");
      if (!provider || !allowed_user_update_providers.includes(provider)) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      await removeConnection(org.streamerId, provider);
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
          pattern: "^[a-z0-9_-]+$",
          maxLength: 32,
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
