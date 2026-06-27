import {
  DonationCreated,
  MonthlySupportStarted,
} from "@/types/webhooks/bmac.types";
import Elysia, { t } from "elysia";
import crypto from "crypto";
import betterConsole, { tsflag, s } from "ts-better-console";
import { prisma } from "@/core/prisma";
import { AlertEventType, TransactionStatus } from "@/generated/prisma/client";

/**
 * Constant-time comparison to prevent timing attacks.
 * 
 * @param rawBody - The raw request body string.
 * @param secret - The configuration secret key.
 * @param signature - The signature sent in webhook headers.
 * @returns Whether the computed HMAC matches the provided signature.
 */
function verifySignature(rawBody: string, secret: string, signature: string): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  
  const computedBuf = Buffer.from(computed);
  const signatureBuf = Buffer.from(signature);
  
  if (computedBuf.length !== signatureBuf.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(computedBuf, signatureBuf);
}

const webhookBodySchema = t.Object({
  type: t.String(),
  live_mode: t.Boolean(),
  attempt: t.Number(),
  created: t.Number(),
  event_id: t.Number(),
  data: t.Union([
    t.Object({
      object: DonationCreated,
      type: t.Literal("donation.created"),
    }),
    t.Object({
      object: MonthlySupportStarted,
      type: t.Literal("recurring_donation.started"),
    }),
  ]),
});

const webhookParser = async ({ request }: { request: Request }) => {
  const text = await request.text();
  Object.defineProperty(request, "rawBody", {
    value: text,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return JSON.parse(text);
};

const webhookHandler = async ({ body, headers, request, set }: any) => {
  try {
    const signature = headers["x-signature-sha256"];
    if (!signature) {
      set.status = 400;
      return "Missing x-signature-sha256 header";
    }

    // Retrieve raw body attached by custom parser
    const rawBody = (request as any).rawBody;
    if (typeof rawBody !== "string") {
      set.status = 400;
      return "Raw body was not captured correctly";
    }

    // Retrieve all integrations with BMAC configuration (select only necessary fields)
    const integrations = await prisma.client.integration.findMany({
      where: {
        bmacSecret: {
          not: null,
        },
      },
      select: {
        userId: true,
        bmacSecret: true,
      },
    });

    // Find the integration that matches the computed signature
    let matchedIntegration = null;
    for (const integration of integrations) {
      if (
        integration.bmacSecret &&
        verifySignature(rawBody, integration.bmacSecret, signature)
      ) {
        matchedIntegration = integration;
        break;
      }
    }

    if (!matchedIntegration) {
      set.status = 401;
      return "Invalid signature";
    }

    const { live_mode, data } = body;

    // Extract transaction detail based on event type
    let providerTxId: string;
    let amount: number;
    let currency: string;
    let senderName: string;
    let senderEmail: string | null = null;
    let message: string | null = null;
    let alertType: AlertEventType;

    if (data.type === "donation.created") {
      const obj = data.object;
      providerTxId = String(obj.id);
      amount = obj.amount;
      currency = obj.currency;
      senderName = obj.supporter_name || "Anonymous";
      senderEmail = obj.supporter_email;
      message = obj.support_note;
      alertType = AlertEventType.TIP;
    } else {
      const obj = data.object;
      providerTxId = String(obj.id);
      amount = obj.amount;
      currency = obj.currency;
      senderName = obj.supporter_name || "Anonymous";
      senderEmail = obj.supporter_email;
      message = obj.support_note;
      alertType = AlertEventType.MEMBERSHIP;
    }

    // Check for duplicate webhook events
    const existingTx = await prisma.client.transactionLog.findUnique({
      where: {
        provider_providerTxId: {
          provider: "buymeacoffee",
          providerTxId,
        },
      },
    });

    if (existingTx) {
      return "Duplicate event ignored";
    }

    // Log the transaction in database
    await prisma.client.transactionLog.create({
      data: {
        userId: matchedIntegration.userId,
        provider: "buymeacoffee",
        providerTxId,
        type: alertType,
        status: TransactionStatus.COMPLETED,
        isTest: !live_mode,
        amount: Math.round(amount * 100), // Store in cents
        currency,
        senderName,
        senderEmail,
        message,
        rawPayload: rawBody,
      },
    });

    return "OK";
  } catch (error) {
    betterConsole.error(
      tsflag("error", true, s("Buy Me a Coffee Webhook Error:", { color: "red" })),
      error
    );
    set.status = 500;
    return "Internal Server Error";
  }
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
