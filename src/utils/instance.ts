import { isDev } from "@/config/env";

/**
 * Detects whether the current running instance is the official alertbox.org production deployment
 * or community self-hosted.
 *
 * ACT_AS can override this ONLY in development env and when CDN_BASE_URL is 127.0.0.1 (secure against host hijacking).
 * When community self-hosted, tenant limitations (org count per user, channel count per org) are unlocked.
 */
export const isAlertboxProduction = (): boolean => {
  const cdn = (process.env.CDN_BASE_URL || "http://127.0.0.1:3001/public/uploads").toLowerCase();
  const isLoopbackCdn = cdn.includes("127.0.0.1");

  if (isDev && isLoopbackCdn) {
    const actAs = (process.env.ACT_AS || "").toLowerCase().trim();
    if (actAs === "self") return false;
    if (actAs === "prod") return true;
  }

  return cdn.includes("static.ponlponl123.com");
};

export const isSelfHosted = (): boolean => !isAlertboxProduction();
