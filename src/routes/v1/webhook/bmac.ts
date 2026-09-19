import Elysia from "elysia";
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

export const endpoint = new Elysia()
  .post("/bmac", webhookHandler, {
    body: webhookBodySchema,
    parse: webhookParser,
  })
  .post("/buymeacoffee", webhookHandler, {
    body: webhookBodySchema,
    parse: webhookParser,
  });

export default endpoint;
