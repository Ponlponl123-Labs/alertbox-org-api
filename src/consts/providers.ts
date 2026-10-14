export const supported_providers = [
  "stripe",
  "buymeacoffee",
  "kofi",
  "xendit",
  "feelfreepay",
  "streamlabs",
] as const;

export type SupportedProvider = (typeof supported_providers)[number];

export const allowed_user_update_providers: readonly SupportedProvider[] = [
  "stripe",
  "buymeacoffee",
  "kofi",
  "feelfreepay",
];

export const providerAliases: Record<string, string> = {
  bmac: "buymeacoffee",
  ffp: "feelfreepay",
};
