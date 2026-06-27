import Elysia, { t } from "elysia";
import crypto from "crypto";
import { redis } from "@/core/redis";
import { prisma } from "@/core/prisma";
import betterConsole, { tsflag, s } from "ts-better-console";
import { AlertEventType, TransactionStatus } from "@/generated/prisma/client";
import { StreamlabsOption } from "@/consts/integration";
import { logDev } from "@/utils/log";

const webhookHandler = async ({ body, set }: any) => {
  try {
    logDev(
      tsflag(
        "info",
        true,
        s("Ko-fi webhook received!", { color: "blue" }),
      ),
    );

    // Ko-fi sends URL-encoded form data with a single "data" parameter containing JSON stringified payload.
    // If it's REST client direct JSON testing, it might be in the root body object.
    let payload: any = null;
    if (body && body.data) {
      payload = typeof body.data === "string" ? JSON.parse(body.data) : body.data;
    } else {
      payload = body;
    }

    if (!payload || !payload.verification_token) {
      set.status = 400;
      return "Missing verification_token";
    }

    const verificationToken = payload.verification_token;

    // Find integration in database matching this kofiSecret
    const matchedIntegration = await prisma.client.integration.findFirst({
      where: {
        kofiSecret: verificationToken,
        deletedAt: null,
      },
      select: {
        userId: true,
        kofiSecret: true,
        streamlabsSecret: true,
        streamlabsOptions: true,
      },
    });

    if (!matchedIntegration) {
      betterConsole.warn(
        tsflag(
          "warn",
          true,
          s("✗ Authentication failed: Invalid Ko-fi verification token.", {
            color: "yellow",
          }),
        ),
      );
      set.status = 401;
      return "Invalid verification token";
    }

    logDev(
      tsflag(
        "info",
        true,
        s("✓ Authenticated Ko-fi webhook via verification_token.", {
          color: "green",
        }),
      ),
    );

    const providerTxId = payload.kofi_transaction_id || payload.message_id;
    if (!providerTxId) {
      set.status = 400;
      return "Missing transaction identifier";
    }

    const amount = Number(payload.amount || 0);
    const currency = payload.currency || "USD";
    const senderName = payload.from_name || "Anonymous";
    const senderEmail = payload.email || null;
    const message = payload.message || null;

    // Determine alert type based on Ko-fi payload properties
    let alertType: AlertEventType = AlertEventType.TIP;
    let optionFlag = StreamlabsOption.KOFI_DONATION_SUCCESS;

    if (payload.is_subscription_payment || payload.type === "Subscription") {
      alertType = AlertEventType.MEMBERSHIP;
      optionFlag = StreamlabsOption.KOFI_DONATION_SUCCESS;
    } else if (payload.shop_items || payload.type === "Shop Order") {
      alertType = AlertEventType.MERCH;
      optionFlag = StreamlabsOption.KOFI_PURCHASE_SUCCESS;
    }

    // Check for duplicate webhook events
    const existingTx = await prisma.client.transactionLog.findUnique({
      where: {
        provider_providerTxId: {
          provider: "kofi",
          providerTxId,
        },
      },
    });

    if (existingTx) {
      logDev(
        tsflag(
          "info",
          true,
          s(`Duplicate event ignored for Ko-fi transaction ID: ${providerTxId}`, {
            color: "yellow",
          }),
        ),
      );
      return "Duplicate event ignored";
    }

    logDev(
      tsflag(
        "info",
        true,
        s(
          `Processing Ko-fi event ${payload.type} (Tx: ${providerTxId}) for user ${matchedIntegration.userId}`,
          { color: "blue" },
        ),
      ),
    );

    // Store transaction log in database
    await prisma.client.transactionLog.create({
      data: {
        userId: matchedIntegration.userId,
        provider: "kofi",
        providerTxId,
        type: alertType,
        status: TransactionStatus.COMPLETED,
        isTest: false,
        amount: Math.round(amount * 100), // Store in cents
        currency,
        senderName,
        senderEmail,
        message,
        rawPayload: JSON.stringify(body),
      },
    });

    // Relay to Streamlabs if connected and enabled
    const isStreamlabsEnabled =
      matchedIntegration.streamlabsOptions === 0 ||
      (matchedIntegration.streamlabsOptions & optionFlag) !== 0;

    if (!matchedIntegration.streamlabsSecret) {
      logDev(
        tsflag(
          "info",
          true,
          s("Streamlabs relay skipped: User has no active Streamlabs connection.", {
            color: "yellow",
          }),
        ),
      );
    } else if (!isStreamlabsEnabled) {
      logDev(
        tsflag(
          "info",
          true,
          s(
            `Streamlabs relay skipped: Option flag ${optionFlag} is disabled (Options: ${matchedIntegration.streamlabsOptions}).`,
            { color: "yellow" },
          ),
        ),
      );
    }

    if (matchedIntegration.streamlabsSecret && isStreamlabsEnabled) {
      logDev(
        tsflag(
          "info",
          true,
          s("Relaying Ko-fi donation to Streamlabs API...", { color: "blue" }),
        ),
      );

      // Create a pending relay log in DB
      let relayLog: any = null;
      try {
        relayLog = await prisma.client.streamlabsRelayLog.create({
          data: {
            userId: matchedIntegration.userId,
            provider: "kofi",
            providerTxId,
            type: alertType,
            status: TransactionStatus.PENDING,
            amount: Math.round(amount * 100), // store in cents
            currency,
            senderName,
            senderEmail,
            message,
          },
        });
        await redis.redis.del(`redis:streamlabs-relay-logs:${matchedIntegration.userId}`);
        
        // Publish real-time pending log event
        await redis.redis.publish(
          `alertbox-org:streamlabs-relay-logs:${matchedIntegration.userId}`,
          JSON.stringify({ event: "created", log: relayLog })
        );
      } catch (dbErr) {
        betterConsole.error(
          tsflag(
            "error",
            true,
            s("Failed to create pending StreamlabsRelayLog:", { color: "red" }),
          ),
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
          name: senderName,
          message: message || "",
          identifier: senderEmail || "kofi",
          amount: amount,
          currency: currency,
          skip_alert: false,
        }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const errText = await res.text();
            betterConsole.error(
              tsflag(
                "error",
                true,
                s("Streamlabs Donation Relay Failed:", { color: "red" }),
              ),
              errText,
            );

            if (relayLog) {
              const updated = await prisma.client.streamlabsRelayLog.update({
                where: { id: relayLog.id },
                data: {
                  status: TransactionStatus.FAILED,
                  errorMessage: errText,
                },
              });
              await redis.redis.del(`redis:streamlabs-relay-logs:${matchedIntegration.userId}`);
              await redis.redis.publish(
                `alertbox-org:streamlabs-relay-logs:${matchedIntegration.userId}`,
                JSON.stringify({ event: "updated", log: updated })
              );
            }
          } else {
            logDev(
              tsflag(
                "info",
                true,
                s("✓ Successfully relayed Ko-fi donation to Streamlabs", {
                  color: "green",
                }),
              ),
            );

            if (relayLog) {
              const updated = await prisma.client.streamlabsRelayLog.update({
                where: { id: relayLog.id },
                data: {
                  status: TransactionStatus.COMPLETED,
                },
              });
              await redis.redis.del(`redis:streamlabs-relay-logs:${matchedIntegration.userId}`);
              await redis.redis.publish(
                `alertbox-org:streamlabs-relay-logs:${matchedIntegration.userId}`,
                JSON.stringify({ event: "updated", log: updated })
              );
            }
          }
        })
        .catch(async (err) => {
          betterConsole.error(
            tsflag(
              "error",
              true,
              s("Streamlabs Donation Relay Error:", { color: "red" }),
            ),
            err,
          );

          if (relayLog) {
            const updated = await prisma.client.streamlabsRelayLog.update({
              where: { id: relayLog.id },
              data: {
                status: TransactionStatus.FAILED,
                errorMessage: String(err),
              },
            });
            await redis.redis.del(`redis:streamlabs-relay-logs:${matchedIntegration.userId}`);
            await redis.redis.publish(
              `alertbox-org:streamlabs-relay-logs:${matchedIntegration.userId}`,
              JSON.stringify({ event: "updated", log: updated })
            );
          }
        });
    }

    // Fetch active widgets of type ALERTBOX for the user
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
      const eventSetting = widget.alertbox?.events.find(
        (e) => e.eventType === alertType && e.isEnabled,
      );

      if (!eventSetting) {
        logDev(
          tsflag(
            "info",
            true,
            s(
              `Skipping widget ${widget.id}: event setting for ${alertType} is missing or disabled.`,
              { color: "yellow" },
            ),
          ),
        );
        continue;
      }

      const prefix = (eventSetting.prefix || "")
        .replace("{{user}}", senderName)
        .replace("{{amount}}", String(amount))
        .replace("{{currency}}", currency);

      const subfix = (eventSetting.subfix || "")
        .replace("{{user}}", senderName)
        .replace("{{amount}}", String(amount))
        .replace("{{currency}}", currency);

      const alertPayload = {
        type: "alert",
        id: crypto.randomUUID(),
        eventType: alertType,
        prefix,
        subfix,
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

      logDev(
        tsflag(
          "info",
          true,
          s(
            `Publishing alert payload to Redis channel: alertbox-org:alerts:${widget.id}`,
            { color: "blue" },
          ),
        ),
      );

      // Publish to Redis channel so all subscribers on all servers receive it
      await redis.redis.publish(
        "alertbox-org:alerts:" + widget.id,
        JSON.stringify(alertPayload),
      );
    }

    return "OK";
  } catch (error) {
    betterConsole.error(
      tsflag(
        "error",
        true,
        s("Ko-fi Webhook Error:", { color: "red" }),
      ),
      error,
    );
    set.status = 500;
    return "Internal Server Error";
  }
};

export const endpoint = new Elysia()
  .post("/kofi", webhookHandler, {
    body: t.Object({}, { additionalProperties: true }),
  });

export default endpoint;
