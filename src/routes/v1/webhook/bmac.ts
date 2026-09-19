import Elysia, { t } from "elysia";
import {
  webhookBodySchema,
  type WebhookBodySchemaType,
} from "@/types/webhooks/bmac.types";
import { webhookParser } from "@/utils/webhook";
import { Webhook, BmacWebhook } from "@/classes/webhook";

export const getBmacIntegrations = BmacWebhook.getIntegrations.bind(BmacWebhook);
export const invalidateBmacIntegrations = BmacWebhook.invalidateIntegrations.bind(BmacWebhook);

const webhookHandler = async ({
  body,
  headers,
  request,
  set,
}: {
  body: WebhookBodySchemaType;
  headers: Record<string, string | undefined>;
  request: Request;
  set: { status?: number | string };
}) => {
  const res = await Webhook.bmac.handle({ body, headers, request });
  set.status = res.status;
  return res.body;
};

const bmacValidation = {
  detail: {
    tags: ["Webhooks & Ingestion"],
    summary: "Ingest Buy Me a Coffee webhook",
    description:
      "Public webhook receiver for Buy Me a Coffee donation and subscription events. Point your BMAC webhook URL to `https://api.alertbox.org/v1/webhook/bmac` or `/webhook/buymeacoffee`. Verifies the `x-signature-sha256` HMAC signature using your BMAC webhook secret, deduplicates transactions, and triggers overlay alerts.",
  },
  headers: t.Object({
    "x-signature-sha256": t.Optional(
      t.String({
        description:
          "HMAC-SHA256 signature calculated across the raw request body using your BMAC webhook secret.",
        examples: [
          "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        ],
      }),
    ),
  }),
  body: webhookBodySchema,
  parse: webhookParser,
  response: {
    200: t.String({
      description: "Webhook received and verified successfully.",
      examples: ["OK"],
    }),
  },
};

export const endpoint = new Elysia()
  .post("/bmac", webhookHandler, bmacValidation)
  .post("/buymeacoffee", webhookHandler, {
    ...bmacValidation,
    detail: { ...bmacValidation.detail, hide: true },
  });

export default endpoint;
