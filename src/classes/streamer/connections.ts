import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { day } from "@/consts/time";
import { invalidateBmacIntegrations } from "@/routes/v1/webhook/bmac";
import {
  supported_providers,
  allowed_user_update_providers,
  providerAliases,
  type SupportedProvider,
} from "@/consts/providers";
import { resolveProvider } from "@/utils/connections";
import { ConnectionSecretPayload } from "@/types/streamer.types";

export {
  supported_providers,
  allowed_user_update_providers,
  providerAliases,
  resolveProvider,
};
export type { SupportedProvider };

export async function setConnection(
  streamerId: string | bigint,
  orgId: string | bigint,
  provider: SupportedProvider,
  payload: ConnectionSecretPayload,
) {
  const secret = typeof payload === "string" ? payload : payload.secret;
  const username = typeof payload === "string" ? null : (payload.username ?? null);
  const refreshToken = typeof payload === "string" ? undefined : payload.refreshToken;

  const data: any = {};
  if (provider === "stripe") data.stripeSecret = secret;
  if (provider === "buymeacoffee") {
    data.bmacSecret = secret;
    if (username) data.bmacUsername = username;
  }
  if (provider === "kofi") {
    data.kofiSecret = secret;
    if (username) data.kofiUsername = username;
  }
  if (provider === "xendit") data.xenditSecret = secret;
  if (provider === "feelfreepay") data.ffpSecret = secret;
  if (provider === "streamlabs") {
    data.streamlabsSecret = secret;
    if (refreshToken !== undefined) data.streamlabsRefreshToken = refreshToken;
  }

  let targetStreamerId: bigint;
  let targetOrgId: bigint;
  try {
    targetStreamerId = BigInt(streamerId);
    targetOrgId = BigInt(orgId);
  } catch {
    return null;
  }

  const updated = await prisma.client.integration.upsert({
    where: { streamerId: targetStreamerId },
    update: data,
    create: {
      streamerId: targetStreamerId,
      orgId: targetOrgId,
      ...data,
    },
  });

  await Promise.all([
    redis.redis.setex(
      `streamer:${String(streamerId)}:connections:${provider}`,
      day,
      secret,
    ),
    redis.redis.del(`streamer:${String(streamerId)}:info`),
  ]);

  if (provider === "buymeacoffee") {
    invalidateBmacIntegrations();
  }

  return updated;
}

export async function removeConnection(
  streamerId: string | bigint,
  provider: SupportedProvider,
) {
  let targetStreamerId: bigint;
  try {
    targetStreamerId = BigInt(streamerId);
  } catch {
    return null;
  }

  const data: any = {};
  if (provider === "stripe") data.stripeSecret = null;
  if (provider === "buymeacoffee") {
    data.bmacSecret = null;
    data.bmacUsername = null;
  }
  if (provider === "kofi") {
    data.kofiSecret = null;
    data.kofiUsername = null;
  }
  if (provider === "xendit") data.xenditSecret = null;
  if (provider === "feelfreepay") data.ffpSecret = null;
  if (provider === "streamlabs") {
    data.streamlabsSecret = null;
    data.streamlabsRefreshToken = null;
  }

  const updated = await prisma.client.integration.update({
    data,
    where: { streamerId: targetStreamerId },
  });

  await Promise.all([
    redis.redis.del(`streamer:${String(streamerId)}:connections:${provider}`),
    redis.redis.del(`streamer:${String(streamerId)}:info`),
  ]);

  if (provider === "buymeacoffee") {
    invalidateBmacIntegrations();
  }

  return updated;
}
