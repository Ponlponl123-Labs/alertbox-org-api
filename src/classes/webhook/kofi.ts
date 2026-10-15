import { prisma } from "@/core/prisma";
import betterConsole, { tsflag, s } from "ts-better-console";
import { logDev } from "@/utils/log";
import { timingSafeEqualString } from "@/utils/security";
import {
  parseKofiPayload,
  isKofiTest,
  generateTestTransactionId,
  resolveKofiEventType,
} from "@/utils/webhook";
import type { WebhookResponse, KofiPayload } from "@/types/webhook.types";
import { WebhookDispatcher } from "./dispatcher";

export interface KofiIntegrationRecord {
  orgId: bigint | string;
  streamerId: bigint | string;
  kofiSecret: string | null;
  streamlabsSecret: string | null;
  streamlabsRefreshToken?: string | null;
  streamlabsOptions: number;
}

let cachedIntegrations: KofiIntegrationRecord[] | null = null;
let lastCacheSync = 0;
const CACHE_TTL_MS = 60_000;

export class KofiWebhook {
  public static async getIntegrations(forceRefresh = false): Promise<KofiIntegrationRecord[]> {
    const now = Date.now();
    if (!forceRefresh && cachedIntegrations && now - lastCacheSync < CACHE_TTL_MS) {
      return cachedIntegrations;
    }

    const integrations = await prisma.client.integration.findMany({
      where: {
        kofiSecret: { not: null },
        deletedAt: null,
      },
      select: {
        orgId: true,
        streamerId: true,
        kofiSecret: true,
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

  public static async handle(body: any): Promise<WebhookResponse> {
    const rawPayload = typeof body === "string" ? body : JSON.stringify(body ?? {});
    let eventType = "unknown";
    let status = "PROCESSING";

    try {
      logDev(tsflag("info", true, s("Ko-fi webhook received!", { color: "blue" })));

      const payload: KofiPayload | null = parseKofiPayload(body);
      eventType = payload?.type || "unknown";

      if (!payload || !payload.verification_token) {
        status = "UNAUTHORIZED: Missing verification token";
        betterConsole.warn(
          tsflag("warn", true, s("✗ Authentication failed: Missing Ko-fi verification token.", { color: "yellow" })),
        );
        return { status: 401, body: "Unauthorized" };
      }

      const verificationToken = payload.verification_token;
      const integrations = await this.getIntegrations();
      let matchedIntegration: KofiIntegrationRecord | null =
        integrations.find((i) => timingSafeEqualString(i.kofiSecret, verificationToken)) ?? null;

      if (!matchedIntegration) {
        const dbMatched = await prisma.client.integration.findFirst({
          where: {
            kofiSecret: verificationToken,
            deletedAt: null,
          },
          select: {
            orgId: true,
            streamerId: true,
            kofiSecret: true,
            streamlabsSecret: true,
            streamlabsRefreshToken: true,
            streamlabsOptions: true,
          },
        });

        if (dbMatched && timingSafeEqualString(dbMatched.kofiSecret, verificationToken)) {
          matchedIntegration = dbMatched;
          this.invalidateIntegrations();
        }
      }

      if (!matchedIntegration) {
        status = "UNAUTHORIZED: Invalid verification token";
        betterConsole.warn(
          tsflag("warn", true, s("✗ Authentication failed: Invalid Ko-fi verification token.", { color: "yellow" })),
        );
        return { status: 401, body: "Invalid verification token" };
      }

      logDev(tsflag("info", true, s("✓ Authenticated Ko-fi webhook via verification_token.", { color: "green" })));

      const rawTxId = payload.kofi_transaction_id || payload.message_id;
      if (!rawTxId) {
        status = "BAD_REQUEST: Missing transaction identifier";
        return { status: 400, body: "Missing transaction identifier" };
      }

      const isTest = isKofiTest(rawTxId, payload);
      const providerTxId = isTest ? generateTestTransactionId(rawTxId) : rawTxId;

      const rawAmount = Number(payload.amount || 0);
      const amount = Number.isFinite(rawAmount) && rawAmount >= 0 ? rawAmount : 0;
      const currency = payload.currency || "USD";
      const senderName = payload.from_name || "Anonymous";
      const senderEmail = payload.email || null;
      const message = payload.message || null;

      const { alertType, optionFlag } = resolveKofiEventType(payload);

      const result = await WebhookDispatcher.processDonation({
        orgId: matchedIntegration.orgId,
        streamerId: matchedIntegration.streamerId,
        provider: "kofi",
        providerTxId,
        type: alertType,
        amount,
        currency,
        senderName,
        senderEmail,
        message,
        isTest,
        rawPayload,
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
        tsflag("error", true, s("Ko-fi Webhook Error:", { color: "red" })),
        error,
      );
      return { status: 500, body: "Internal Server Error" };
    } finally {
      await WebhookDispatcher.logWebhook("kofi", eventType, rawPayload, status);
    }
  }
}
