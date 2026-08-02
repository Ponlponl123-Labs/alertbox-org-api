import { webhookBodySchema } from "@/types/webhooks/bmac.types";
import Elysia from "elysia";
import crypto from "crypto";
import { redis } from "@/core/redis";
import { prisma } from "@/core/prisma";
import betterConsole, { tsflag, s } from "ts-better-console";
import { AlertEventType, TransactionStatus } from "@/generated/prisma/client";
import { StreamlabsOption } from "@/consts/integration";
import { verifySignature } from "@/utils/signature";
import { webhookParser } from "@/utils/webhook";
import { logDev } from "@/utils/log";
import { formatStreamlabsName } from "@/utils/streamlabs";

const webhookHandler = async ({ body, headers, request, set }: any) => {
  try {
    logDev(
      tsflag(
        "info",
        true,
        s("Buy Me a Coffee webhook received!", { color: "blue" }),
      ),
    );

    let matchedIntegration: {
      userId: string;
      bmacSecret: string | null;
      streamlabsSecret: string | null;
      streamlabsOptions: number;
    } | null = null;
    const authHeader = headers["authorization"];
    const rawBody = (request as any).rawBody;

    if (authHeader) {
      // Extract bearer token
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : authHeader;

      // Find integration in database with this bmacSecret
      const matched = await prisma.client.integration.findFirst({
        where: {
          bmacSecret: token,
          deletedAt: null,
        },
        select: {
          userId: true,
          bmacSecret: true,
          streamlabsSecret: true,
          streamlabsOptions: true,
        },
      });

      if (matched) {
        matchedIntegration = matched;
        logDev(
          tsflag(
            "info",
            true,
            s("✓ Authenticated webhook via Bearer token (testing/fake).", {
              color: "green",
            }),
          ),
        );
      }
    }

    // Fallback to signature verification if not authorized via Bearer token
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
          streamlabsSecret: true,
          streamlabsOptions: true,
        },
      });

      // Find the integration that matches the computed signature
      for (const integration of integrations) {
        if (
          integration.bmacSecret &&
          verifySignature(rawBody, integration.bmacSecret, signature)
        ) {
          matchedIntegration = integration;
          logDev(
            tsflag(
              "info",
              true,
              s("✓ Authenticated webhook via HMAC signature verification.", {
                color: "green",
              }),
            ),
          );
          break;
        }
      }
    }

    if (!matchedIntegration) {
      betterConsole.warn(
        tsflag(
          "warn",
          true,
          s("✗ Authentication failed: Invalid signature or token.", {
            color: "yellow",
          }),
        ),
      );
      set.status = 401;
      return "Invalid signature or authorization token";
    }

    const { type, live_mode, data } = body;

    // Extract transaction detail based on event type
    let providerTxId: string;
    let amount: number;
    let currency: string;
    let senderName: string;
    let senderEmail: string | null = null;
    let message: string | null = null;
    let alertType: AlertEventType;

    if (type === "donation.created") {
      providerTxId = String(data.transaction_id);
      amount = data.amount;
      currency = data.currency;
      senderName = data.supporter_name || "Anonymous";
      senderEmail = data.supporter_email;
      message = data.support_note;
      alertType = AlertEventType.TIP;
    } else {
      providerTxId = String(data.transaction_id);
      amount = data.amount;
      currency = data.currency;
      senderName = data.supporter_name || "Anonymous";
      senderEmail = data.supporter_email;
      message = data.support_note;
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
      logDev(
        tsflag(
          "info",
          true,
          s(`Duplicate event ignored for transaction ID: ${providerTxId}`, {
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
          `Processing event ${type} (Tx: ${providerTxId}) for user ${matchedIntegration.userId}`,
          { color: "blue" },
        ),
      ),
    );

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

    // Differentiate options depending on event type
    const optionFlag =
      alertType === AlertEventType.MEMBERSHIP
        ? StreamlabsOption.BMAC_MEMBERSHIP_SUCCESS
        : StreamlabsOption.BMAC_DONATION_SUCCESS;

    // Relay to Streamlabs if connected and enabled
    const isStreamlabsEnabled =
      matchedIntegration.streamlabsOptions === 0 ||
      (matchedIntegration.streamlabsOptions & optionFlag) !== 0;

    if (!matchedIntegration.streamlabsSecret) {
      logDev(
        tsflag(
          "info",
          true,
          s(
            "Streamlabs relay skipped: User has no active Streamlabs connection.",
            { color: "yellow" },
          ),
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
          s("Relaying donation to Streamlabs API...", { color: "blue" }),
        ),
      );

      // Create a pending relay log in DB
      let relayLog: any = null;
      try {
        relayLog = await prisma.client.streamlabsRelayLog.create({
          data: {
            userId: matchedIntegration.userId,
            provider: "buymeacoffee",
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
          name: formatStreamlabsName(senderName),
          message: message || "",
          identifier: senderEmail || "buymeacoffee",
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
                s("✓ Successfully relayed donation to Streamlabs", {
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
        s("Buy Me a Coffee Webhook Error:", { color: "red" }),
      ),
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
