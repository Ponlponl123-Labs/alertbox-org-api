import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { invalidateBmacIntegrations } from "@/routes/v1/webhook/bmac";

export const supported_providers = [
  "stripe",
  "buymeacoffee",
  "kofi",
  "xendit",
  "feelfreepay",
  "streamlabs",
] as const;

export const allowed_user_update_providers: SupportedProvider[] = [
  "stripe",
  "buymeacoffee",
  "kofi",
  "feelfreepay",
] as const;

export type SupportedProvider = (typeof supported_providers)[number];

export const providerAliases: Record<string, string> = {
  bmac: "buymeacoffee",
  ffp: "feelfreepay",
};

/**
 * Resolve a provider name from an alias.
 */
export function resolveProvider(name: string): SupportedProvider | null {
  const normalized = name.toLowerCase();
  const target = (providerAliases[normalized] ?? normalized) as any;
  return supported_providers.includes(target) ? target : null;
}

export async function setConnection(
  uid: string,
  provider: SupportedProvider,
  payload: string | { username?: string | null; secret: string; refreshToken?: string | null },
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

  const updated = await prisma.client.integration.upsert({
    where: { userId: uid },
    update: data,
    create: {
      userId: uid,
      ...data,
    },
  });

  await Promise.all([
    redis.redis.setex(
      `user:${uid}:connections:${provider}`,
      24 * 60 * 60 * 1000,
      secret,
    ),
    redis.redis.del(`user:${uid}:info`),
  ]);

  if (provider === "buymeacoffee") {
    invalidateBmacIntegrations();
  }

  return updated;
}

export async function removeConnection(
  uid: string,
  provider: SupportedProvider,
) {
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
    where: { userId: uid },
  });

  await Promise.all([
    redis.redis.del(`user:${uid}:connections:${provider}`),
    redis.redis.del(`user:${uid}:info`),
  ]);

  if (provider === "buymeacoffee") {
    invalidateBmacIntegrations();
  }

  return updated;
}
