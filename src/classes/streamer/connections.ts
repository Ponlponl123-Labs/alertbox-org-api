import { db } from "@/db";
import { redis } from "@/core/redis";
import { day } from "@/consts/time";
import { invalidateBmacIntegrations } from "@/routes/v1/webhook/bmac";
import { invalidateKofiIntegrations } from "@/routes/v1/webhook/kofi";
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

  await db
    .insertInto("Integration")
    .values({
      streamerId: Number(targetStreamerId),
      orgId: Number(targetOrgId),
      ...data,
      updatedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      ...data,
      updatedAt: new Date(),
    })
    .execute();

  const updated = await db
    .selectFrom("Integration")
    .selectAll()
    .where("streamerId", "=", Number(targetStreamerId))
    .executeTakeFirst();

  await Promise.all([
    redis.redis.setex(
      `streamer:${String(streamerId)}:connections:${provider}`,
      day,
      secret,
    ),
    redis.redis.del(`streamer:${String(streamerId)}:info`),
    redis.redis.del(`streamer:${String(streamerId)}:public_details`),
  ]);

  if (provider === "buymeacoffee") {
    invalidateBmacIntegrations();
  }
  if (provider === "kofi") {
    invalidateKofiIntegrations();
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

  await db
    .updateTable("Integration")
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where("streamerId", "=", Number(targetStreamerId))
    .execute();

  const updated = await db
    .selectFrom("Integration")
    .selectAll()
    .where("streamerId", "=", Number(targetStreamerId))
    .executeTakeFirst();

  await Promise.all([
    redis.redis.del(`streamer:${String(streamerId)}:connections:${provider}`),
    redis.redis.del(`streamer:${String(streamerId)}:info`),
    redis.redis.del(`streamer:${String(streamerId)}:public_details`),
  ]);

  if (provider === "buymeacoffee") {
    invalidateBmacIntegrations();
  }
  if (provider === "kofi") {
    invalidateKofiIntegrations();
  }

  return updated;
}
