import crypto from "node:crypto";
import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { redis } from "@/core/redis";

const WS_TICKET_TTL_SEC = 15;
const FALLBACK_MAX_SIZE = 1000;
const fallbackTickets = new Map<string, { userId: string; expiresAt: number }>();

function hashTicket(ticket: string): string {
  return crypto.createHash("sha256").update(ticket).digest("hex");
}

function pruneFallback(now: number): void {
  for (const [k, v] of fallbackTickets) {
    if (v.expiresAt <= now) fallbackTickets.delete(k);
  }
  while (fallbackTickets.size >= FALLBACK_MAX_SIZE) {
    const oldest = fallbackTickets.keys().next().value;
    if (!oldest) break;
    fallbackTickets.delete(oldest);
  }
}

export async function issueWsTicket(
  userId: bigint | string | number,
  ip?: string,
): Promise<{ ticket: string; expiresIn: number }> {
  const ticket = crypto.randomBytes(32).toString("base64url");
  const hash = hashTicket(ticket);
  const uid = String(userId);

  if (redis.redis.status === "ready") {
    try {
      await redis.redis.setex(
        `ws:ticket:${hash}`,
        WS_TICKET_TTL_SEC,
        JSON.stringify({ userId: uid, ip: ip || null }),
      );
      return { ticket, expiresIn: WS_TICKET_TTL_SEC };
    } catch {
      // Fall through to bounded in-memory store if Redis transient error occurs
    }
  }

  const now = Date.now();
  pruneFallback(now);
  fallbackTickets.set(hash, {
    userId: uid,
    expiresAt: now + WS_TICKET_TTL_SEC * 1000,
  });

  return { ticket, expiresIn: WS_TICKET_TTL_SEC };
}

export async function consumeWsTicket(
  ticket: string | null | undefined,
): Promise<{ userId: bigint } | null> {
  if (!ticket || typeof ticket !== "string" || !/^[a-zA-Z0-9_-]{16,128}$/.test(ticket)) {
    return null;
  }

  const hash = hashTicket(ticket);

  if (redis.redis.status === "ready") {
    try {
      const key = `ws:ticket:${hash}`;
      const raw = typeof (redis.redis as any).getdel === "function"
        ? await (redis.redis as any).getdel(key)
        : await (async () => {
            const val = await redis.redis.get(key);
            if (val) await redis.redis.del(key);
            return val;
          })();
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.userId) return { userId: BigInt(parsed.userId) };
      }
      return null;
    } catch {
      // Fall back to in-memory check only if Redis failed
    }
  }

  const entry = fallbackTickets.get(hash);
  if (!entry) return null;
  fallbackTickets.delete(hash);
  if (entry.expiresAt <= Date.now()) return null;

  try {
    return { userId: BigInt(entry.userId) };
  } catch {
    return null;
  }
}

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/ws-ticket",
    async ({ getAuthenticatedUser, ip, set }) => {
      const user = await getAuthenticatedUser({ id: true });
      set.headers["Cache-Control"] = "no-store";
      return issueWsTicket(user.data.id, ip);
    },
    {
      detail: {
        tags: ["Authentication"],
        summary: "Issue single-use WebSocket connection ticket",
        description:
          "Generates a 256-bit single-use ticket valid for 15 seconds so browser clients never pass session bearer tokens in WebSocket query strings.",
      },
      response: {
        200: t.Object({
          ticket: t.String({ description: "Single-use opaque WebSocket ticket" }),
          expiresIn: t.Number({ description: "Ticket lifetime in seconds", examples: [15] }),
        }),
      },
    },
  );

export default endpoint;
