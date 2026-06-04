import { prisma, redis } from "@/index";

export const supported_providers = [
  "stripe",
  "buymeacoffee",
  "kofi",
  "feelfreepay",
  "streamlabs",
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

/**
 * Update a connection secret for a user.
 */
export async function setConnection(uid: string, provider: SupportedProvider, secret: string) {
  const data: any = {};
  if (provider === "stripe") data.stripeSecret = secret;
  if (provider === "buymeacoffee") data.bmacSecret = secret;
  if (provider === "kofi") data.kofiSecret = secret;
  if (provider === "feelfreepay") data.ffpSecret = secret;
  if (provider === "streamlabs") data.streamlabsSecret = secret;

  const updated = await prisma.client.integration.upsert({
    where: { userId: uid },
    update: data,
    create: {
      userId: uid,
      ...data,
    },
  });

  void redis.redis.setex(
    `user:${uid}:connections:${provider}`,
    24 * 60 * 60 * 1000,
    secret,
  );

  return updated;
}

/**
 * Remove a connection secret for a user.
 */
export async function removeConnection(uid: string, provider: SupportedProvider) {
  const data: any = {};
  if (provider === "stripe") data.stripeSecret = null;
  if (provider === "buymeacoffee") data.bmacSecret = null;
  if (provider === "kofi") data.kofiSecret = null;
  if (provider === "feelfreepay") data.ffpSecret = null;
  if (provider === "streamlabs") data.streamlabsSecret = null;

  const updated = await prisma.client.integration.update({
    data,
    where: { userId: uid },
  });

  void redis.redis.del(`user:${uid}:connections:${provider}`);

  return updated;
}
