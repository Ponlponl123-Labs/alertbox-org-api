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
import { IntegrationType } from "@/db/enums";

export const providerToIntegrationType: Record<string, IntegrationType> = {
  stripe: IntegrationType.STRIPE,
  buymeacoffee: IntegrationType.BUYMEACOFFEE,
  bmac: IntegrationType.BUYMEACOFFEE,
  kofi: IntegrationType.KOFI,
  xendit: IntegrationType.XENDIT,
  feelfreepay: IntegrationType.FEELFREEPAY,
  ffp: IntegrationType.FEELFREEPAY,
  streamlabs: IntegrationType.STREAMLABS,
  discord: IntegrationType.DISCORD,
};

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
  const intType = providerToIntegrationType[provider.toLowerCase()];
  if (!intType) return null;

  const secret = typeof payload === "string" ? payload : payload.secret;
  const username = typeof payload === "string" ? null : (payload.username ?? null);
  const refreshToken = typeof payload === "string" ? null : (payload.refreshToken ?? null);

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
      type: intType,
      secret,
      username,
      refreshToken,
      disabledAt: null,
      deletedAt: null,
      updatedAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      secret,
      username,
      ...(refreshToken ? { refreshToken } : {}),
      disabledAt: null,
      deletedAt: null,
      updatedAt: new Date(),
    })
    .execute();

  const updated = await db
    .selectFrom("Integration")
    .selectAll()
    .where("streamerId", "=", Number(targetStreamerId))
    .where("type", "=", intType)
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

  if (intType === IntegrationType.BUYMEACOFFEE) {
    invalidateBmacIntegrations();
  }
  if (intType === IntegrationType.KOFI) {
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

  const intType = providerToIntegrationType[provider.toLowerCase()];
  if (!intType) return null;

  await db
    .deleteFrom("Integration")
    .where("streamerId", "=", Number(targetStreamerId))
    .where("type", "=", intType)
    .execute();

  await Promise.all([
    redis.redis.del(`streamer:${String(streamerId)}:connections:${provider}`),
    redis.redis.del(`streamer:${String(streamerId)}:info`),
    redis.redis.del(`streamer:${String(streamerId)}:public_details`),
  ]);

  if (intType === IntegrationType.BUYMEACOFFEE) {
    invalidateBmacIntegrations();
  }
  if (intType === IntegrationType.KOFI) {
    invalidateKofiIntegrations();
  }

  return true;
}

export async function setConnectionDisabled(
  streamerId: string | bigint,
  provider: SupportedProvider,
  disabled: boolean,
) {
  let targetStreamerId: bigint;
  try {
    targetStreamerId = BigInt(streamerId);
  } catch {
    return null;
  }

  const intType = providerToIntegrationType[provider.toLowerCase()];
  if (!intType) return null;

  await db
    .updateTable("Integration")
    .set({
      disabledAt: disabled ? new Date() : null,
      updatedAt: new Date(),
    })
    .where("streamerId", "=", Number(targetStreamerId))
    .where("type", "=", intType)
    .execute();

  await Promise.all([
    redis.redis.del(`streamer:${String(streamerId)}:public_details`),
    redis.redis.del(`streamer:${String(streamerId)}:info`),
  ]);

  if (intType === IntegrationType.BUYMEACOFFEE) {
    invalidateBmacIntegrations();
  }
  if (intType === IntegrationType.KOFI) {
    invalidateKofiIntegrations();
  }

  return true;
}
