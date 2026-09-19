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
      detail: {
        tags: ["Payment Connections"],
        summary: "Connect or update a payment provider",
        description:
          "Links credentials for payment gateways and donation platforms. Supported `:provider` values: `stripe`, `kofi`, `buymeacoffee` (or `bmac`), `feelfreepay` (or `ffp`). For Ko-fi and BMAC, both `username` and `secret` are required. For Stripe and FeelFreePay, supply either an object with `secret` or raw secret string.",
      },
      params: t.Object({
        provider: t.String({
          description:
            "Target provider name or alias (`stripe`, `kofi`, `buymeacoffee`, `feelfreepay`).",
          examples: ["kofi"],
        }),
      }),
      body: t.Union(
        [
          t.Object(
            {
              secret: t.String({
                description:
                  "API key, webhook secret, or verification token.",
                examples: ["whsec_1234567890abcdef"],
              }),
              username: t.Optional(
                t.String({
                  description:
                    "Platform username (required for Ko-fi and Buy Me a Coffee).",
                  examples: ["creator_name"],
                }),
              ),
            },
            {
              description: "Structured provider credentials object.",
            },
          ),
          t.String({
            description:
              "Raw secret or API key string (supported for Stripe & FeelFreePay).",
            examples: ["whsec_1234567890abcdef"],
          }),
        ],
        {
          description: "Provider configuration payload.",
          examples: [{ secret: "your-secret-key", username: "creator_name" }],
        },
      ),
      response: {
        200: t.String({
          description: "Provider credentials saved successfully.",
          examples: ["OK"],
        }),
      },
    },
  );

export default endpoint;
