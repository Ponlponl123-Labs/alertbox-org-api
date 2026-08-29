import Elysia, { t } from "elysia";
import crypto from "crypto";
import { redis } from "@/core/redis";
import { prisma } from "@/core/prisma";
import betterConsole, { tsflag, s } from "ts-better-console";
import { AlertEventType, TransactionStatus } from "@/generated/prisma/client";
import { StreamlabsOption } from "@/consts/integration";
import { logDev } from "@/utils/log";
import { formatStreamlabsName, relayStreamlabsDonation } from "@/utils/streamlabs";

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
      betterConsole.warn(
        tsflag(
          "warn",
          true,
          s("✗ Authentication failed: Missing Ko-fi verification token.", {
            color: "yellow",
          }),
        ),
      );
      set.status = "Unauthorized";
      return "Unauthorized";
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
        streamlabsRefreshToken: true,
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

      relayStreamlabsDonation({
        userId: matchedIntegration.userId,
        accessToken: matchedIntegration.streamlabsSecret,
        refreshToken: matchedIntegration.streamlabsRefreshToken,
        name: senderName,
        message,
        identifier: senderEmail || "kofi",
        amount,
        currency,
        provider: "kofi",
        providerTxId,
        alertType,
      });
    }

    // Fetch active widgets of type ALERTBOX for the user
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
        event: alertType,
        name: senderName,
        amount,
        currency,
        message: message || "",
        createdAt: Date.now(),
      };

      logDev(
        tsflag(
          "info",
          true,
          s(
            `Publishing tiny alert payload to Redis channel: alertbox-org:alerts:${widget.id}`,
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
