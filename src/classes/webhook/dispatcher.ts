import crypto from "crypto";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { TransactionStatus } from "@/db/enums";
import betterConsole, { tsflag, s } from "ts-better-console";
import { logDev } from "@/utils/log";
import { relayStreamlabsDonation } from "@/utils/streamlabs";
import type { DonationEventPayload } from "@/types/webhook.types";
import { broadcastStreamerTransaction } from "@/routes/v1/org/streamers/transactions/broadcast";
import { getBunServer } from "@/core/bun-server";

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
      await db
        .insertInto("WebhookLog")
        .values({
          provider,
          eventType,
          rawPayload,
          status,
        })
        .execute();
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
    const existingTx = await db
      .selectFrom("TransactionLog")
      .where("provider", "=", provider)
      .where("providerTxId", "=", providerTxId)
      .select("id")
      .executeTakeFirst();
    return !!existingTx;
  }

  /**
   * Record transaction to TransactionLog.
   */
  public static async recordTransaction(
    payload: DonationEventPayload,
  ): Promise<void> {
    let targetOrgId: bigint;
    let targetStreamerId: bigint;
    try {
      targetOrgId = BigInt(payload.orgId);
      targetStreamerId = BigInt(payload.streamerId);
    } catch {
      return;
    }

    const amount = Math.round((Number.isFinite(payload.amount) && payload.amount >= 0 ? payload.amount : 0) * 100);
    const now = new Date();

    const insertRes = await db
      .insertInto("TransactionLog")
      .values({
        orgId: Number(targetOrgId),
        streamerId: Number(targetStreamerId),
        provider: payload.provider,
        providerTxId: payload.providerTxId,
        type: payload.type,
        status: payload.status ?? TransactionStatus.COMPLETED,
        isTest: payload.isTest ? 1 : 0,
        amount,
        currency: payload.currency,
        senderName: payload.senderName,
        senderEmail: payload.senderEmail ?? null,
        message: payload.message ?? null,
        rawPayload: payload.rawPayload,
        updatedAt: now,
      })
      .executeTakeFirst();

    const txId = insertRes.insertId ? String(insertRes.insertId) : String(Date.now());

    broadcastStreamerTransaction(targetOrgId, targetStreamerId, {
      type: "transaction:new",
      transaction: {
        id: txId,
        provider: payload.provider,
        type: payload.type,
        status: payload.status ?? TransactionStatus.COMPLETED,
        isTest: payload.isTest,
        amount,
        currency: payload.currency,
        senderName: payload.senderName,
        message: payload.message ?? null,
        createdAt: now.toISOString(),
        isDeleted: false,
      },
    }).catch(() => {});
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
          s("Streamlabs relay skipped: Streamer has no active Streamlabs connection.", {
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
      orgId: payload.orgId,
      streamerId: payload.streamerId,
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
   * Broadcast alert payload to all streamer's active ALERTBOX widgets via Redis Pub/Sub.
   */
  public static async dispatchAlerts(
    streamerId: string | bigint,
    alertData: {
      type: DonationEventPayload["type"];
      name: string;
      amount: number;
      currency: string;
      message: string | null;
    },
  ): Promise<void> {
    let targetStreamerId: bigint;
    try {
      targetStreamerId = BigInt(streamerId);
    } catch {
      return;
    }

    const widgets = await db
      .selectFrom("Widget")
      .where("streamerId", "=", Number(targetStreamerId))
      .where("type", "=", "ALERTBOX")
      .where("deletedAt", "is", null)
      .select("id")
      .execute();

    logDev(
      tsflag(
        "info",
        true,
        s(`Fetched ${widgets.length} active ALERTBOX widgets for streamer.`, {
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

      const strPayload = JSON.stringify(alertPayload);
      const bunServer = getBunServer();
      if (bunServer) {
        bunServer.publish(`widget:${widget.id}`, strPayload);
      }

      try {
        if (redis.redis.status === "ready") {
          await redis.redis.publish(
            `alertbox-org:alerts:${widget.id}`,
            strPayload,
          );
        }
      } catch {
        // ignore redis error
      }
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
          `Processing ${payload.provider} event ${payload.type} (Tx: ${payload.providerTxId}) for streamer ${payload.streamerId} (org ${payload.orgId})`,
          { color: "blue" },
        ),
      ),
    );

    await this.recordTransaction(payload);
    this.relayStreamlabs(payload);
    await this.dispatchAlerts(payload.streamerId, {
      type: payload.type,
      name: payload.senderName,
      amount: payload.amount,
      currency: payload.currency,
      message: payload.message ?? null,
    });

    return { duplicate: false };
  }
}
