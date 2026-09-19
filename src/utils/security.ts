import crypto from "crypto";
import { isDev } from "@/config/env";

/**
 * Validates whether an Origin or redirect_uri origin is authorized.
 * Uses strict URL parsing to prevent ReDoS and subdomain spoofing.
 */
export function isAllowedOrigin(originStr: string | null | undefined): boolean {
  if (!originStr || typeof originStr !== "string") return false;
  try {
    const url = new URL(originStr);
    if (isDev && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
      return true;
    }
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "alertbox.org" ||
      host.endsWith(".alertbox.org") ||
      host === "tip-to.me" ||
      host.endsWith(".tip-to.me")
    );
  } catch {
    return false;
  }
}

/**
 * Constant-time string comparison to prevent timing side-channel attacks on secret tokens.
 */
export function timingSafeEqualString(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
