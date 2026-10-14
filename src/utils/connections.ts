import { supported_providers, providerAliases } from "@/consts/providers";
import { SupportedProvider } from "@/types/streamer.types";

/**
 * Resolve a provider name from an alias or standard name.
 */
export function resolveProvider(name: string): SupportedProvider | null {
  const normalized = name.toLowerCase();
  const target = (providerAliases[normalized] ?? normalized) as any;
  return (supported_providers as readonly string[]).includes(target) ? (target as SupportedProvider) : null;
}
