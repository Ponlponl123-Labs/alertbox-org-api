import crypto from "crypto";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { TransactionStatus } from "@/generated/prisma/client";
import betterConsole, { tsflag, s } from "ts-better-console";
import { logDev } from "@/utils/log";
import { relayStreamlabsDonation } from "@/utils/streamlabs";
import type { DonationEventPayload } from "@/types/webhook.types";

export class WebhookDispatcher {
  /**
   * Infallible raw webhook logger. Records incoming webhooks regardless of outcome.
   */
  public static async logWebhook(
    provider: string,
    eventType: string,
    rawPayload: string,
    status: string,
  ): Promise<void> {
    try {
      await prisma.client.webhookLog.create({
        data: {
          provider,
          eventType,
          rawPayload,
          status,
        },
      });
    } catch (error) {
      betterConsole.error(
        tsflag("error", true, s("Failed to write WebhookLog:", { color: "red" })),
        error,
      );
    }
  }

  /**
   * Check if transaction already exists in database.
   */
  public static async isDuplicateTx(
    provider: string,
    providerTxId: string,
  ): Promise<boolean> {
    const existingTx = await prisma.client.transactionLog.findUnique({
      where: {
        provider_providerTxId: {
          provider,
          providerTxId,
        },
      },
    });
    return !!existingTx;
  }

  /**
   * Record transaction to TransactionLog.
   */
  public static async recordTransaction(
    payload: DonationEventPayload,
  ): Promise<void> {
    await prisma.client.transactionLog.create({
      data: {
        userId: payload.userId,
        provider: payload.provider,
        providerTxId: payload.providerTxId,
        type: payload.type,
        status: payload.status ?? TransactionStatus.COMPLETED,
        isTest: payload.isTest,
        amount: Math.round(payload.amount * 100),
        currency: payload.currency,
        senderName: payload.senderName,
        senderEmail: payload.senderEmail ?? null,
        message: payload.message ?? null,
        rawPayload: payload.rawPayload,
      },
    });
  }

  /**
   * Relay donation to Streamlabs if configured and enabled.
   */
  public static relayStreamlabs(payload: DonationEventPayload): void {
    if (!payload.streamlabs?.secret) {
      logDev(
        tsflag(
          "info",
          true,
          s("Streamlabs relay skipped: User has no active Streamlabs connection.", {
            color: "yellow",
          }),
        ),
      );
      return;
    }

    const { secret, refreshToken, options, optionFlag } = payload.streamlabs;
    const isStreamlabsEnabled = options === 0 || (options & optionFlag) !== 0;

    if (!isStreamlabsEnabled) {
      logDev(
        tsflag(
          "info",
          true,
          s(
            `Streamlabs relay skipped: Option flag ${optionFlag} is disabled (Options: ${options}).`,
            { color: "yellow" },
          ),
        ),
      );
      return;
    }

    logDev(
      tsflag("info", true, s(`Relaying ${payload.provider} donation to Streamlabs API...`, { color: "blue" })),
    );

    relayStreamlabsDonation({
      userId: payload.userId,
      accessToken: secret,
      refreshToken: refreshToken,
      name: payload.senderName,
      message: payload.message ?? null,
      identifier: payload.senderEmail || payload.provider,
      amount: payload.amount,
      currency: payload.currency,
      provider: payload.provider as "kofi" | "buymeacoffee",
      providerTxId: payload.providerTxId,
      alertType: payload.type,
    });
  }

  /**
   * Broadcast alert payload to all user's active ALERTBOX widgets via Redis Pub/Sub.
   */
  public static async dispatchAlerts(
    userId: string,
    alertData: {
      type: DonationEventPayload["type"];
      name: string;
      amount: number;
      currency: string;
      message: string | null;
    },
  ): Promise<void> {
    const widgets = await prisma.client.widget.findMany({
      where: {
        userId,
        type: "ALERTBOX",
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    logDev(
      tsflag(
        "info",
        true,
        s(`Fetched ${widgets.length} active ALERTBOX widgets for user.`, {
          color: "blue",
        }),
      ),
    );

    for (const widget of widgets) {
      const alertPayload = {
        type: "alert",
        id: crypto.randomUUID(),
        event: alertData.type,
        name: alertData.name,
        amount: alertData.amount,
        currency: alertData.currency,
        message: alertData.message || "",
        createdAt: Date.now(),
      };

      logDev(
        tsflag(
          "info",
          true,
          s(`Publishing alert payload to Redis channel: alertbox-org:alerts:${widget.id}`, {
            color: "blue",
          }),
        ),
      );

      await redis.redis.publish(
        `alertbox-org:alerts:${widget.id}`,
        JSON.stringify(alertPayload),
      );
    }
  }

  /**
   * Full pipeline: duplicate check → record transaction → relay Streamlabs → dispatch Redis alerts.
   */
  public static async processDonation(
    payload: DonationEventPayload,
  ): Promise<{ duplicate: boolean }> {
    if (!payload.isTest) {
      const isDuplicate = await this.isDuplicateTx(
        payload.provider,
        payload.providerTxId,
      );
      if (isDuplicate) {
        logDev(
          tsflag(
            "info",
            true,
            s(`Duplicate event ignored for ${payload.provider} transaction ID: ${payload.providerTxId}`, {
              color: "yellow",
            }),
          ),
        );
        return { duplicate: true };
      }
    }

    logDev(
      tsflag(
        "info",
        true,
        s(
          `Processing ${payload.provider} event ${payload.type} (Tx: ${payload.providerTxId}) for user ${payload.userId}`,
          { color: "blue" },
        ),
      ),
    );

    await this.recordTransaction(payload);
    this.relayStreamlabs(payload);
    await this.dispatchAlerts(payload.userId, {
      type: payload.type,
      name: payload.senderName,
      amount: payload.amount,
      currency: payload.currency,
      message: payload.message ?? null,
    });

    return { duplicate: false };
  }
}
