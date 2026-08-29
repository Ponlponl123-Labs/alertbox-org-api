import Elysia from "elysia";
import crypto from "crypto";
import {
  webhookBodySchema,
  type WebhookBodySchemaType,
  type BmacIntegrationRecord,
} from "@/types/webhooks/bmac.types";
import { redis } from "@/core/redis";
import { prisma } from "@/core/prisma";
import betterConsole, { tsflag, s } from "ts-better-console";
import { AlertEventType, TransactionStatus } from "@/generated/prisma/client";
import { StreamlabsOption } from "@/consts/integration";
import { verifySignature } from "@/utils/signature";
import { webhookParser } from "@/utils/webhook";
import { logDev } from "@/utils/log";
import { formatStreamlabsName, relayStreamlabsDonation } from "@/utils/streamlabs";


let cachedIntegrations: BmacIntegrationRecord[] | null = null;
let lastCacheSync = 0;
const CACHE_TTL_MS = 60_000;

export async function getBmacIntegrations(forceRefresh = false): Promise<BmacIntegrationRecord[]> {
  const now = Date.now();
  if (!forceRefresh && cachedIntegrations && now - lastCacheSync < CACHE_TTL_MS) {
    return cachedIntegrations;
  }

  const integrations = await prisma.client.integration.findMany({
    where: {
      bmacSecret: { not: null },
      deletedAt: null,
    },
    select: {
      userId: true,
      bmacSecret: true,
      streamlabsSecret: true,
      streamlabsRefreshToken: true,
      streamlabsOptions: true,
    },
  });

  cachedIntegrations = integrations;
  lastCacheSync = now;
  return integrations;
}

export function invalidateBmacIntegrations(): void {
  cachedIntegrations = null;
  lastCacheSync = 0;
}

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
  try {
    logDev(
      tsflag(
        "info",
        true,
        s("Buy Me a Coffee webhook received", { color: "blue" }),
      ),
    );

    let matchedIntegration: BmacIntegrationRecord | null = null;
    const authHeader = headers["authorization"];
    const rawBody = (request as unknown as { rawBody?: string }).rawBody;

    const integrations = await getBmacIntegrations();

    if (authHeader) {
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

      matchedIntegration = integrations.find((i) => i.bmacSecret === token) ?? null;
      if (!matchedIntegration) {
        const dbMatched = await prisma.client.integration.findFirst({
          where: { bmacSecret: token, deletedAt: null },
          select: {
            userId: true,
            bmacSecret: true,
            streamlabsSecret: true,
            streamlabsRefreshToken: true,
            streamlabsOptions: true,
          },
        });
        if (dbMatched) {
          matchedIntegration = dbMatched;
          invalidateBmacIntegrations();
        }
      }
    }

    if (!matchedIntegration) {
      const signature = headers["x-signature-sha256"];
      if (!signature) {
        set.status = 400;
        return "Missing x-signature-sha256 header";
      }

      if (typeof rawBody !== "string") {
        set.status = 400;
        return "Raw body was not captured correctly";
      }

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
        const freshIntegrations = await getBmacIntegrations(true);
        for (const integration of freshIntegrations) {
          if (
            integration.bmacSecret &&
            verifySignature(rawBody, integration.bmacSecret, signature)
          ) {
            matchedIntegration = integration;
            break;
          }
        }
      }
    }

    if (!matchedIntegration) {
      betterConsole.warn(
        tsflag(
          "warn",
          true,
          s("Authentication failed: Invalid signature or token", {
            color: "yellow",
          }),
        ),
      );
      set.status = 401;
      return "Invalid signature or authorization token";
    }

    const { type, live_mode, data } = body;
    const isDonation = type === "donation.created";
    const alertType = isDonation ? AlertEventType.TIP : AlertEventType.MEMBERSHIP;
    const rawTxId = isDonation && "transaction_id" in data && data.transaction_id
      ? String(data.transaction_id)
      : String(data.id);

    const isTest =
      !live_mode ||
      rawTxId === "1" ||
      rawTxId === "0" ||
      rawTxId.toLowerCase().includes("test") ||
      (typeof data.supporter_name === "string" && data.supporter_name.toLowerCase().includes("test"));

    const providerTxId = isTest
      ? `${rawTxId}_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
      : rawTxId;

    const amount = Number(data.amount || 0);
    const currency = data.currency || "USD";
    const senderName = data.supporter_name || "Anonymous";
    const senderEmail = data.supporter_email ?? null;
    const message = data.support_note ?? null;

    if (!isTest) {
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
    }

    await prisma.client.transactionLog.create({
      data: {
        userId: matchedIntegration.userId,
        provider: "buymeacoffee",
        providerTxId,
        type: alertType,
        status: TransactionStatus.COMPLETED,
        isTest,
        amount: Math.round(amount * 100),
        currency,
        senderName,
        senderEmail,
        message,
        rawPayload: rawBody ?? JSON.stringify(body),
      },
    });

    const optionFlag = isDonation
      ? StreamlabsOption.BMAC_DONATION_SUCCESS
      : StreamlabsOption.BMAC_MEMBERSHIP_SUCCESS;

    const isStreamlabsEnabled =
      matchedIntegration.streamlabsOptions === 0 ||
      (matchedIntegration.streamlabsOptions & optionFlag) !== 0;

    if (matchedIntegration.streamlabsSecret && isStreamlabsEnabled) {
      logDev(
        tsflag("info", true, s("Relaying BMAC donation to Streamlabs API...", { color: "blue" })),
      );

      relayStreamlabsDonation({
        userId: matchedIntegration.userId,
        accessToken: matchedIntegration.streamlabsSecret,
        refreshToken: matchedIntegration.streamlabsRefreshToken,
        name: senderName,
        message,
        identifier: senderEmail || "buymeacoffee",
        amount,
        currency,
        provider: "buymeacoffee",
        providerTxId,
        alertType,
      });
    }

    const widgets = await prisma.client.widget.findMany({
      where: {
        userId: matchedIntegration.userId,
        type: "ALERTBOX",
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    for (const widget of widgets) {
      const alertPayload = {
        type: "alert",
        id: crypto.randomUUID(),
        event: alertType,
        name: senderName,
        amount,
        currency,
        message: message || "",
        createdAt: Date.now(),
      };

      await redis.redis.publish(
        `alertbox-org:alerts:${widget.id}`,
        JSON.stringify(alertPayload),
      );
    }

    return "OK";
  } catch (error) {
    betterConsole.error(
      tsflag("error", true, s("Buy Me a Coffee Webhook Error:", { color: "red" })),
      error,
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
