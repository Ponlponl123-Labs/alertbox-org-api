import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { setConnection } from "@/classes/me/connections";
import { streamlabs_redirect_uri } from "@/consts/integration";
import betterConsole, { tsflag, s } from "ts-better-console";
import { TransactionStatus } from "@/generated/prisma/client";
import { logDev } from "@/utils/log";

/**
 * Formats and sanitizes a donor/supporter name to conform to Streamlabs API requirements.
 * Streamlabs requires donor names to be between 2 and 25 characters and contain only
 * letters, numbers, spaces, and underscores.
 */
export function formatStreamlabsName(name?: string | null): string {
  const fallback = "Anonymous";

  if (!name) {
    return fallback;
  }

  const cleaned = name
    .replace(/[^\p{L}\p{N} _]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  const chars = Array.from(cleaned);

  if (chars.length < 2) {
    return fallback;
  }

  let finalName = cleaned;
  if (chars.length > 25) {
    finalName = chars.slice(0, 25).join("").trim();
  }

  const isValid = /^[\p{L}\p{N} _]{2,25}$/u.test(finalName);
  return isValid ? finalName : fallback;
}

/**
 * Refreshes an expired Streamlabs OAuth access token using the stored refresh token.
 */
export async function refreshStreamlabsToken(
  userId: string,
  refreshToken: string,
): Promise<string | null> {
  try {
    const r = await fetch("https://streamlabs.com/api/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        client_id: process.env.STREAMLABS_CLIENT_ID,
        client_secret: process.env.STREAMLABS_CLIENT_SECRET,
        redirect_uri: streamlabs_redirect_uri,
        refresh_token: refreshToken,
      }),
    });

    if (!r.ok) {
      return null;
    }

    const data = await r.json();
    if (!data.access_token) {
      return null;
    }

    await setConnection(userId, "streamlabs", {
      secret: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
    });

    return data.access_token as string;
  } catch {
    return null;
  }
}

export interface RelayStreamlabsDonationParams {
  userId: string;
  accessToken: string;
  refreshToken?: string | null;
  name: string | null;
  message?: string | null;
  identifier?: string | null;
  amount: number;
  currency: string;
  provider: "kofi" | "buymeacoffee";
  providerTxId?: string | null;
  alertType?: any;
}

/**
 * Relays donation events to the Streamlabs API with automated retry on 401 token expiry.
 */
export async function relayStreamlabsDonation({
  userId,
  accessToken,
  refreshToken,
  name,
  message,
  identifier,
  amount,
  currency,
  provider,
  providerTxId,
  alertType,
}: RelayStreamlabsDonationParams): Promise<void> {
  let relayLogId: string | null = null;

  try {
    const relayLog = await prisma.client.streamlabsRelayLog.create({
      data: {
        userId,
        provider,
        providerTxId: providerTxId ?? null,
        type: alertType,
        status: TransactionStatus.PENDING,
        amount: Math.round(amount * 100),
        currency,
        senderName: name ?? "Anonymous",
        senderEmail: identifier ?? null,
        message: message ?? null,
      },
    });
    relayLogId = relayLog.id;
    await redis.redis.del(`redis:streamlabs-relay-logs:${userId}`);
    await redis.redis.publish(
      `alertbox-org:streamlabs-relay-logs:${userId}`,
      JSON.stringify({ event: "created", log: relayLog }),
    );
  } catch (dbErr) {
    betterConsole.error(
      tsflag("error", true, s("Failed to create pending StreamlabsRelayLog:", { color: "red" })),
      dbErr,
    );
  }

  const donationPayload = {
    name: formatStreamlabsName(name),
    message: message || "",
    identifier: identifier || provider,
    amount,
    currency,
    skip_alert: false,
  };

  const sendReq = (token: string) =>
    fetch("https://streamlabs.com/api/v2.0/donations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(donationPayload),
    });

  let currentToken = accessToken;
  let res: Response | null = null;
  let errText: string | null = null;

  try {
    res = await sendReq(currentToken);

    if (res.status === 401 && refreshToken) {
      logDev(
        tsflag("info", true, s("Streamlabs access token expired (401), refreshing token...", { color: "yellow" })),
      );
      const newToken = await refreshStreamlabsToken(userId, refreshToken);
      if (newToken) {
        currentToken = newToken;
        res = await sendReq(currentToken);
      }
    }

    if (!res.ok) {
      errText = await res.text();
      betterConsole.error(
        tsflag("error", true, s("Streamlabs Donation Relay Failed:", { color: "red" })),
        errText,
      );
    } else {
      logDev(
        tsflag("info", true, s(`✓ Successfully relayed ${provider} donation to Streamlabs`, { color: "green" })),
      );
    }
  } catch (err: unknown) {
    errText = String(err);
    betterConsole.error(
      tsflag("error", true, s("Streamlabs Donation Relay Error:", { color: "red" })),
      err,
    );
  }

  if (relayLogId) {
    const isOk = res?.ok ?? false;
    try {
      const updated = await prisma.client.streamlabsRelayLog.update({
        where: { id: relayLogId },
        data: {
          status: isOk ? TransactionStatus.COMPLETED : TransactionStatus.FAILED,
          errorMessage: isOk ? null : errText,
        },
      });
      await redis.redis.del(`redis:streamlabs-relay-logs:${userId}`);
      await redis.redis.publish(
        `alertbox-org:streamlabs-relay-logs:${userId}`,
        JSON.stringify({ event: "updated", log: updated }),
      );
    } catch (updateErr) {
      betterConsole.error(
        tsflag("error", true, s("Failed to update StreamlabsRelayLog:", { color: "red" })),
        updateErr,
      );
    }
  }
}
