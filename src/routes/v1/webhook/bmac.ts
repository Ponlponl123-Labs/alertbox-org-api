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
import { formatStreamlabsName } from "@/utils/streamlabs";


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
    const providerTxId = isDonation && "transaction_id" in data && data.transaction_id
      ? String(data.transaction_id)
      : String(data.id);
    const amount = Number(data.amount || 0);
    const currency = data.currency || "USD";
    const senderName = data.supporter_name || "Anonymous";
    const senderEmail = data.supporter_email ?? null;
    const message = data.support_note ?? null;

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

    await prisma.client.transactionLog.create({
      data: {
        userId: matchedIntegration.userId,
        provider: "buymeacoffee",
        providerTxId,
        type: alertType,
        status: TransactionStatus.COMPLETED,
        isTest: !live_mode,
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
      let relayLogId: string | null = null;
      try {
        const relayLog = await prisma.client.streamlabsRelayLog.create({
          data: {
            userId: matchedIntegration.userId,
            provider: "buymeacoffee",
            providerTxId,
            type: alertType,
            status: TransactionStatus.PENDING,
            amount: Math.round(amount * 100),
            currency,
            senderName,
            senderEmail,
            message,
          },
        });
        relayLogId = relayLog.id;
        await redis.redis.del(`redis:streamlabs-relay-logs:${matchedIntegration.userId}`);
        await redis.redis.publish(
          `alertbox-org:streamlabs-relay-logs:${matchedIntegration.userId}`,
          JSON.stringify({ event: "created", log: relayLog }),
        );
      } catch (dbErr) {
        betterConsole.error(
          tsflag("error", true, s("Failed to create pending StreamlabsRelayLog:", { color: "red" })),
          dbErr,
        );
      }

      fetch("https://streamlabs.com/api/v2.0/donations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${matchedIntegration.streamlabsSecret}`,
        },
        body: JSON.stringify({
          name: formatStreamlabsName(senderName),
          message: message || "",
          identifier: senderEmail || "buymeacoffee",
          amount,
          currency,
          skip_alert: false,
        }),
      })
        .then(async (res) => {
          const isOk = res.ok;
          const errText = isOk ? null : await res.text();

          if (!isOk) {
            betterConsole.error(
              tsflag("error", true, s("Streamlabs Donation Relay Failed:", { color: "red" })),
              errText,
            );
          }

          if (relayLogId) {
            const updated = await prisma.client.streamlabsRelayLog.update({
              where: { id: relayLogId },
              data: {
                status: isOk ? TransactionStatus.COMPLETED : TransactionStatus.FAILED,
                errorMessage: errText,
              },
            });
            await redis.redis.del(`redis:streamlabs-relay-logs:${matchedIntegration.userId}`);
            await redis.redis.publish(
              `alertbox-org:streamlabs-relay-logs:${matchedIntegration.userId}`,
              JSON.stringify({ event: "updated", log: updated }),
            );
          }
        })
        .catch(async (err: unknown) => {
          betterConsole.error(
            tsflag("error", true, s("Streamlabs Donation Relay Error:", { color: "red" })),
            err,
          );

          if (relayLogId) {
            const updated = await prisma.client.streamlabsRelayLog.update({
              where: { id: relayLogId },
              data: {
                status: TransactionStatus.FAILED,
                errorMessage: String(err),
              },
            });
            await redis.redis.del(`redis:streamlabs-relay-logs:${matchedIntegration.userId}`);
            await redis.redis.publish(
              `alertbox-org:streamlabs-relay-logs:${matchedIntegration.userId}`,
              JSON.stringify({ event: "updated", log: updated }),
            );
          }
        });
    }

    const widgets = await prisma.client.widget.findMany({
      where: {
        userId: matchedIntegration.userId,
        type: "ALERTBOX",
        deletedAt: null,
      },
      include: {
        alertbox: {
          include: {
            events: true,
          },
        },
      },
    });

    for (const widget of widgets) {
      const eventSetting = widget.alertbox?.events.find(
        (e) => e.eventType === alertType && e.isEnabled,
      );

      if (!eventSetting) continue;

      const formatTemplate = (tpl?: string | null) =>
        (tpl || "")
          .replace("{{user}}", senderName)
          .replace("{{amount}}", String(amount))
          .replace("{{currency}}", currency);

      const alertPayload = {
        type: "alert",
        id: crypto.randomUUID(),
        eventType: alertType,
        prefix: formatTemplate(eventSetting.prefix),
        subfix: formatTemplate(eventSetting.subfix),
        messageLayout: eventSetting.messageLayout,
        minVisibleDuration: eventSetting.minVisibleDuration,
        animIn: eventSetting.animIn,
        animOut: eventSetting.animOut,
        animInDuration: eventSetting.animInDuration,
        animOutDuration: eventSetting.animOutDuration,
        image: eventSetting.image,
        sound: eventSetting.sound,
        soundVolume: eventSetting.soundVolume,
        fontFamily: eventSetting.fontFamily,
        fontSize: eventSetting.fontSize,
        fontWeight: eventSetting.fontWeight,
        textColor: eventSetting.textColor,
        accentColor: eventSetting.accentColor,
        subfixColor: eventSetting.subfixColor,
        donorColor: eventSetting.donorColor,
        amountColor: eventSetting.amountColor,
        textShadowColor: eventSetting.textShadowColor,
        textShadowSize: eventSetting.textShadowSize,
        outlineColor: eventSetting.outlineColor,
        outlineSize: eventSetting.outlineSize,
        ttsEnabled: eventSetting.ttsEnabled && amount >= eventSetting.ttsMinTip,
        ttsVoice: eventSetting.ttsVoice,
        ttsVolume: eventSetting.ttsVolume,
        ttsSpeed: eventSetting.ttsSpeed,
        ttsPitch: eventSetting.ttsPitch,
        ttsDelay: eventSetting.ttsDelay,
        ttsOptions: eventSetting.ttsOptions,
        message: message || "",
        senderName,
        amount,
        currency,
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
