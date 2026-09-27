import os from "node:os";
import crypto from "crypto";
import { isDev } from "@/config/env";

const isPrivateHost = (host: string): boolean => {
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".lan") || host.endsWith(".internal")) {
    return true;
  }
  return (
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    host === "::1" ||
    host === "[::1]"
  );
};

const getDevAllowedHosts = (): Set<string> => {
  const hosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const devAllowed = process.env.DEV_ALLOWED_HOST;
  if (devAllowed === "false") return hosts;

  for (const net of Object.values(os.networkInterfaces()).flat()) {
    if (net && net.family === "IPv4" && !net.internal) {
      hosts.add(net.address);
    }
  }

  if (devAllowed && devAllowed !== "true") {
    for (const h of devAllowed.split(",")) {
      const trimmed = h.trim();
      if (trimmed) hosts.add(trimmed);
    }
  }

  return hosts;
};

let cachedDevHosts: Set<string> | null = null;

/**
 * Validates whether an Origin or redirect_uri origin is authorized.
 * Uses strict URL parsing to prevent ReDoS and subdomain spoofing.
 */
export function isAllowedOrigin(originStr: string | null | undefined): boolean {
  if (!originStr || typeof originStr !== "string") return false;
  try {
    const url = new URL(originStr);
    if (isDev) {
      const devAllowed = process.env.DEV_ALLOWED_HOST;
      if (devAllowed === "*") return true;
      if (devAllowed !== "false" && isPrivateHost(url.hostname)) return true;
      if (!cachedDevHosts) cachedDevHosts = getDevAllowedHosts();
      if (cachedDevHosts.has(url.hostname)) return true;
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
