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
export async function setConnection(uid: bigint, provider: SupportedProvider, secret: string) {
  const updated = await prisma.client.accounts.update({
    data: {
      stripe_secret: provider === "stripe" ? secret : undefined,
      bmac_secret: provider === "buymeacoffee" ? secret : undefined,
      kofi_secret: provider === "kofi" ? secret : undefined,
      ffp_secret: provider === "feelfreepay" ? secret : undefined,
      streamlabs_secret: provider === "streamlabs" ? secret : undefined,
    },
    where: { id: uid },
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
export async function removeConnection(uid: bigint, provider: SupportedProvider) {
  const updated = await prisma.client.accounts.update({
    data: {
      stripe_secret: provider === "stripe" ? null : undefined,
      bmac_secret: provider === "buymeacoffee" ? null : undefined,
      kofi_secret: provider === "kofi" ? null : undefined,
      ffp_secret: provider === "feelfreepay" ? null : undefined,
      streamlabs_secret: provider === "streamlabs" ? null : undefined,
    },
    where: { id: uid },
  });

  void redis.redis.del(`user:${uid}:connections:${provider}`);

  return updated;
}
