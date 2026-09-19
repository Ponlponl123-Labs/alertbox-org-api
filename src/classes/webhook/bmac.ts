import { prisma } from "@/core/prisma";
import betterConsole, { tsflag, s } from "ts-better-console";
import { AlertEventType } from "@/generated/prisma/client";
import { StreamlabsOption } from "@/consts/integration";
import { verifySignature } from "@/utils/signature";
import { timingSafeEqualString } from "@/utils/security";
import { logDev } from "@/utils/log";
import { isBmacTest, generateTestTransactionId } from "@/utils/webhook";
import type { BmacIntegrationRecord } from "@/types/webhooks/bmac.types";
import type { BmacWebhookParams, WebhookResponse } from "@/types/webhook.types";
import { WebhookDispatcher } from "./dispatcher";

let cachedIntegrations: BmacIntegrationRecord[] | null = null;
let lastCacheSync = 0;
const CACHE_TTL_MS = 60_000;

export class BmacWebhook {
  public static async getIntegrations(forceRefresh = false): Promise<BmacIntegrationRecord[]> {
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

  public static invalidateIntegrations(): void {
    cachedIntegrations = null;
    lastCacheSync = 0;
  }

  public static async handle({
    body,
    headers,
    request,
  }: BmacWebhookParams): Promise<WebhookResponse> {
    const rawBody =
      (request as unknown as { rawBody?: string }).rawBody ??
      (typeof body === "string" ? body : JSON.stringify(body ?? {}));
    const eventType = body?.type || "unknown";
    let status = "PROCESSING";

    try {
      logDev(tsflag("info", true, s("Buy Me a Coffee webhook received", { color: "blue" })));

      let matchedIntegration: BmacIntegrationRecord | null = null;
      const authHeader = headers["authorization"];

      const integrations = await this.getIntegrations();

      if (authHeader) {
        const token = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : authHeader;

        matchedIntegration =
          integrations.find((i) => timingSafeEqualString(i.bmacSecret, token)) ?? null;
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
            this.invalidateIntegrations();
          }
        }
      }

      if (!matchedIntegration) {
        const signature = headers["x-signature-sha256"];
        if (!signature) {
          status = "BAD_REQUEST: Missing x-signature-sha256 header";
          return { status: 400, body: "Missing x-signature-sha256 header" };
        }

        if (typeof rawBody !== "string") {
          status = "BAD_REQUEST: Raw body was not captured correctly";
          return { status: 400, body: "Raw body was not captured correctly" };
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
          const freshIntegrations = await this.getIntegrations(true);
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
        status = "UNAUTHORIZED: Invalid signature or token";
        betterConsole.warn(
          tsflag("warn", true, s("Authentication failed: Invalid signature or token", { color: "yellow" })),
        );
        return { status: 401, body: "Invalid signature or authorization token" };
      }

      const { type, live_mode, data } = body;
      const isDonation = type === "donation.created";
      const alertType = isDonation ? AlertEventType.TIP : AlertEventType.MEMBERSHIP;
      const rawTxId =
        isDonation && "transaction_id" in data && data.transaction_id
          ? String(data.transaction_id)
          : String(data.id);

      const isTest = isBmacTest(rawTxId, live_mode, data.supporter_name);
      const providerTxId = isTest ? generateTestTransactionId(rawTxId) : rawTxId;

      const amount = Number(data.amount || 0);
      const currency = data.currency || "USD";
      const senderName = data.supporter_name || "Anonymous";
      const senderEmail = data.supporter_email ?? null;
      const message = data.support_note ?? null;

      const optionFlag = isDonation
        ? StreamlabsOption.BMAC_DONATION_SUCCESS
        : StreamlabsOption.BMAC_MEMBERSHIP_SUCCESS;

      const result = await WebhookDispatcher.processDonation({
        userId: matchedIntegration.userId,
        provider: "buymeacoffee",
        providerTxId,
        type: alertType,
        amount,
        currency,
        senderName,
        senderEmail,
        message,
        isTest,
        rawPayload: rawBody,
        streamlabs: matchedIntegration.streamlabsSecret
          ? {
              secret: matchedIntegration.streamlabsSecret,
              refreshToken: matchedIntegration.streamlabsRefreshToken ?? null,
              options: matchedIntegration.streamlabsOptions,
              optionFlag,
            }
          : null,
      });

      if (result.duplicate) {
        status = "DUPLICATE: Ignored";
        return { status: 200, body: "Duplicate event ignored" };
      }

      status = "COMPLETED";
      return { status: 200, body: "OK" };
    } catch (error: any) {
      status = `ERROR: ${error?.message || "Internal server error"}`;
      betterConsole.error(
        tsflag("error", true, s("Buy Me a Coffee Webhook Error:", { color: "red" })),
        error,
      );
      return { status: 500, body: "Internal Server Error" };
    } finally {
      await WebhookDispatcher.logWebhook("buymeacoffee", eventType, rawBody, status);
    }
  }
}
