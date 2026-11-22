import { resolveMx } from "node:dns/promises";
import { redis } from "@/core/redis";

const EMAIL_FORMAT_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MX_CACHE_TTL_SEC = 3600;
const MX_LOOKUP_TIMEOUT_MS = 3000;

export type MxResolver = (domain: string) => Promise<Array<{ exchange: string; priority: number }>>;

export function isValidEmailFormat(email: string): boolean {
  if (!email || email.length > 320) return false;
  return EMAIL_FORMAT_RE.test(email);
}

export async function validateEmailWithMx(
  rawEmail: string,
  mxResolver: MxResolver = resolveMx,
): Promise<{ valid: boolean; normalized: string }> {
  const normalized = String(rawEmail ?? "").trim().toLowerCase();
  if (!isValidEmailFormat(normalized)) {
    return { valid: false, normalized };
  }

  const atIdx = normalized.lastIndexOf("@");
  const domain = normalized.slice(atIdx + 1);
  if (!domain || domain.length > 253) {
    return { valid: false, normalized };
  }

  const cacheKey = `mx:valid:${domain}`;
  if (mxResolver === resolveMx && redis.redis.status === "ready") {
    const cached = await redis.redis.get(cacheKey).catch(() => null);
    if (cached === "1") return { valid: true, normalized };
    if (cached === "0") return { valid: false, normalized };
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    const records = await Promise.race([
      mxResolver(domain),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("MX lookup timeout")), MX_LOOKUP_TIMEOUT_MS);
      }),
    ]);
    const hasValidMx =
      Array.isArray(records) &&
      records.some((r) => typeof r?.exchange === "string" && r.exchange.trim().length > 0);

    if (mxResolver === resolveMx && redis.redis.status === "ready") {
      await redis.redis.setex(cacheKey, MX_CACHE_TTL_SEC, hasValidMx ? "1" : "0").catch(() => {});
    }

    return { valid: hasValidMx, normalized };
  } catch {
    return { valid: false, normalized };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
