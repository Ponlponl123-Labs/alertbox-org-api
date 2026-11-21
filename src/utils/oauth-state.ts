import crypto from "node:crypto";
import { redis } from "@/core/redis";
import { timingSafeEqualString } from "@/utils/security";

const OAUTH_STATE_TTL_SEC = 600;
const FALLBACK_MAX_SIZE = 1000;
const fallbackNonces = new Map<string, number>();

const MASTER_SECRET =
  process.env.TOKEN_MASTER_SECRET || "alertbox-org-super-secure-master-key-32b!";
const HMAC_KEY = crypto.createHash("sha256").update(MASTER_SECRET).digest();

function signState(
  streamerId: string,
  orgId: string,
  userId: string,
  provider: string,
  ts: number,
  nonce: string,
): string {
  return crypto
    .createHmac("sha256", HMAC_KEY)
    .update(`${streamerId}.${orgId}.${userId}.${provider}.${ts}.${nonce}`)
    .digest("hex")
    .slice(0, 32);
}

function pruneFallbackNonces(now: number): void {
  for (const [k, exp] of fallbackNonces) {
    if (exp <= now) fallbackNonces.delete(k);
  }
  while (fallbackNonces.size >= FALLBACK_MAX_SIZE) {
    const oldest = fallbackNonces.keys().next().value;
    if (!oldest) break;
    fallbackNonces.delete(oldest);
  }
}

export async function createOAuthState(
  streamerId: bigint | string,
  orgId: bigint | string,
  userId: bigint | string,
  provider: string,
): Promise<string> {
  const sId = String(streamerId);
  const oId = String(orgId);
  const uId = String(userId);
  const ts = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");
  const sig = signState(sId, oId, uId, provider, ts, nonce);

  if (redis.redis.status === "ready") {
    try {
      await redis.redis.setex(`oauth:state:${nonce}`, OAUTH_STATE_TTL_SEC, uId);
    } catch {
      const now = Date.now();
      pruneFallbackNonces(now);
      fallbackNonces.set(nonce, now + OAUTH_STATE_TTL_SEC * 1000);
    }
  } else {
    const now = Date.now();
    pruneFallbackNonces(now);
    fallbackNonces.set(nonce, now + OAUTH_STATE_TTL_SEC * 1000);
  }

  // Preserves `${streamerId}.${orgId}` prefix so existing frontend `state.split(".")` keeps working
  return `${sId}.${oId}.${ts}.${nonce}.${sig}`;
}

export async function verifyOAuthState(
  state: string | null | undefined,
  expectedStreamerId: bigint | string,
  expectedOrgId: bigint | string,
  userId: bigint | string,
  provider: string,
): Promise<boolean> {
  if (!state || typeof state !== "string") return false;
  const parts = state.split(".");
  if (parts.length !== 5) return false;

  const [sId, oId, tsRaw, nonce, sig] = parts;
  if (sId !== String(expectedStreamerId) || oId !== String(expectedOrgId)) {
    return false;
  }
  if (!/^[a-f0-9]{32}$/i.test(nonce) || !/^[a-f0-9]{32}$/i.test(sig)) {
    return false;
  }

  const ts = Number(tsRaw);
  const nowSec = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || ts > nowSec + 60 || nowSec - ts > OAUTH_STATE_TTL_SEC) {
    return false;
  }

  const expectedSig = signState(sId, oId, String(userId), provider, ts, nonce);
  if (!timingSafeEqualString(sig, expectedSig)) {
    return false;
  }

  if (redis.redis.status === "ready") {
    try {
      const key = `oauth:state:${nonce}`;
      const storedUid =
        typeof (redis.redis as any).getdel === "function"
          ? await (redis.redis as any).getdel(key)
          : await (async () => {
              const v = await redis.redis.get(key);
              if (v) await redis.redis.del(key);
              return v;
            })();
      return storedUid === String(userId);
    } catch {
      // Fall back to local nonce map on transient Redis failure
    }
  }

  const exp = fallbackNonces.get(nonce);
  if (!exp) return false;
  fallbackNonces.delete(nonce);
  return exp > Date.now();
}
