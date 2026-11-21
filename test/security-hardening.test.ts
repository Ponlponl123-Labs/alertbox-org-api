import Elysia from "elysia";
import { describe, expect, it } from "bun:test";
import {
  buildSessionCookieHeader,
  extractCookieToken,
  extractRequestToken,
  extractRequestTokenWithSource,
} from "../src/utils/bearer-token";
import { createOAuthState, verifyOAuthState } from "../src/utils/oauth-state";
import { issueWsTicket, consumeWsTicket } from "../src/routes/v1/auth/ws-ticket";
import { resolvePreservedSecret } from "../src/routes/v1/org/streamers/integration/common";
import { formatKeysetCursor, parseKeysetCursor } from "../src/utils/pagination";
import { checkRateLimit } from "../src/utils/rate-limit";
import { endpoint as integrationEndpoint } from "../src/routes/v1/org/streamers/integration";
import { endpoint as wsTicketEndpoint } from "../src/routes/v1/auth/ws-ticket";
import { auth, UnauthorizedError, BadRequestError } from "../src/core/auth";

describe("Backend Security Hardening & Pagination", () => {
  it("extracts Bearer and USRSS cookie tokens cleanly and builds env-aware Set-Cookie", () => {
    expect(extractCookieToken("foo=1; USRSS=abc.123_def; bar=2")).toBe("abc.123_def");
    expect(extractCookieToken("USRSS=bad%20token")).toBe(false);

    expect(
      extractRequestTokenWithSource({
        authorization: "Bearer hdr_tok_1",
        cookie: "USRSS=ck_tok_2",
      }),
    ).toEqual({ token: "hdr_tok_1", source: "bearer" });

    expect(
      extractRequestTokenWithSource({
        cookie: "other=x; USRSS=ck_tok_2",
      }),
    ).toEqual({ token: "ck_tok_2", source: "cookie" });

    expect(extractRequestToken({ cookie: "USRSS=ck_tok_2" })).toBe("ck_tok_2");

    const origEnv = process.env.NODE_ENV;
    const origDomain = process.env.COOKIE_DOMAIN;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.COOKIE_DOMAIN;
      const prodCookie = buildSessionCookieHeader("sess_123");
      expect(prodCookie).toContain("USRSS=sess_123");
      expect(prodCookie).toContain("HttpOnly");
      expect(prodCookie).toContain("Secure");
      expect(prodCookie).toContain("SameSite=Lax");
      expect(prodCookie).toContain("Domain=.alertbox.org");

      const clearCookie = buildSessionCookieHeader("", true);
      expect(clearCookie).toContain("USRSS=;");
      expect(clearCookie).toContain("Max-Age=0");

      process.env.NODE_ENV = "development";
      const devCookie = buildSessionCookieHeader("sess_dev");
      expect(devCookie).not.toContain("Secure");
      expect(devCookie).not.toContain("Domain=.alertbox.org");
    } finally {
      process.env.NODE_ENV = origEnv;
      if (origDomain === undefined) delete process.env.COOKIE_DOMAIN;
      else process.env.COOKIE_DOMAIN = origDomain;
    }
  });

  it("issues HMAC-signed single-use OAuth state and rejects tampering or replay", async () => {
    const state = await createOAuthState("10", "20", "30", "stripe");
    const parts = state.split(".");
    expect(parts[0]).toBe("10");
    expect(parts[1]).toBe("20");
    expect(parts.length).toBe(5);

    // Wrong streamer/org/user/provider must fail BEFORE consuming the nonce
    expect(await verifyOAuthState(state, "99", "20", "30", "stripe")).toBe(false);
    expect(await verifyOAuthState(state, "10", "99", "30", "stripe")).toBe(false);
    expect(await verifyOAuthState(state, "10", "20", "99", "stripe")).toBe(false);
    expect(await verifyOAuthState(state, "10", "20", "30", "streamlabs")).toBe(false);

    // Tampered signature must fail
    const tampered = state.slice(0, -1) + (state.endsWith("a") ? "b" : "a");
    expect(await verifyOAuthState(tampered, "10", "20", "30", "stripe")).toBe(false);

    // Valid first verification succeeds
    expect(await verifyOAuthState(state, "10", "20", "30", "stripe")).toBe(true);
    // Replay fails
    expect(await verifyOAuthState(state, "10", "20", "30", "stripe")).toBe(false);
  });

  it("issues single-use ephemeral WebSocket tickets and rejects replays", async () => {
    const { ticket, expiresIn } = await issueWsTicket("42", "127.0.0.1");
    expect(expiresIn).toBe(15);
    expect(ticket.length).toBeGreaterThanOrEqual(32);

    const first = await consumeWsTicket(ticket);
    expect(first).toEqual({ userId: 42n });

    // Second consume must return null (replay blocked)
    const replay = await consumeWsTicket(ticket);
    expect(replay).toBeNull();
    expect(await consumeWsTicket("invalid")).toBeNull();
  });

  it("preserves existing webhook secrets when masked hint is submitted back", () => {
    expect(resolvePreservedSecret("••••wxyz", "real_secret_wxyz")).toBe("real_secret_wxyz");
    expect(resolvePreservedSecret("••••••••", "real_secret_wxyz")).toBe("real_secret_wxyz");
    expect(resolvePreservedSecret("new_secret_1234", "real_secret_wxyz")).toBe("new_secret_1234");
  });

  it("formats and parses keyset cursors safely", () => {
    const dt = new Date("2026-11-21T15:00:00.000Z");
    const cursor = formatKeysetCursor(dt, 98765n);
    const parsed = parseKeysetCursor(cursor);
    expect(parsed).not.toBeNull();
    expect(parsed?.id).toBe(98765);
    expect(parsed?.createdAt.toISOString()).toBe("2026-11-21T15:00:00.000Z");

    expect(parseKeysetCursor("invalid")).toBeNull();
    expect(parseKeysetCursor("not-a-date_123")).toBeNull();
    expect(parseKeysetCursor("2026-11-21T15:00:00.000Z_abc")).toBeNull();
  });

  it("enforces sliding window rate limits in fallback mode", async () => {
    const key = `test:rl:${Date.now()}`;
    expect((await checkRateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await checkRateLimit(key, 2, 60)).allowed).toBe(true);
    const third = await checkRateLimit(key, 2, 60);
    expect(third.allowed).toBe(false);
    expect(third.retryAfterSec).toBeGreaterThanOrEqual(1);
  });

  it("mounts /connections/stripe alias and /ws-ticket with auth and CSRF origin guards", async () => {
    const stripeAliasRes = await integrationEndpoint.handle(
      new Request("http://localhost/1/streamers/2/connections/stripe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "ac_mock" }),
      }),
    );
    expect(stripeAliasRes.status).not.toBe(404);
    expect([400, 401, 403, 500]).toContain(stripeAliasRes.status);

    const testApp = new Elysia()
      .onError(({ error, set }) => {
        if (error instanceof UnauthorizedError) {
          set.status = 401;
          return error.message;
        }
        if (error instanceof BadRequestError) {
          set.status = 400;
          return error.message;
        }
        set.status = 500;
        return "Internal Server Error";
      })
      .use(auth)
      .use(wsTicketEndpoint);

    const wsNoAuth = await testApp.handle(
      new Request("http://localhost/ws-ticket", { method: "POST" }),
    );
    expect(wsNoAuth.status).toBe(400);

    const csrfBadOrigin = await testApp.handle(
      new Request("http://localhost/ws-ticket", {
        method: "POST",
        headers: {
          cookie: "USRSS=dummy_cookie_token",
          origin: "https://evil.example",
        },
      }),
    );
    expect(csrfBadOrigin.status).toBe(401);
    expect(await csrfBadOrigin.text()).toBe("Invalid origin");

    const csrfCrossSite = await testApp.handle(
      new Request("http://localhost/ws-ticket", {
        method: "POST",
        headers: {
          cookie: "USRSS=dummy_cookie_token",
          "sec-fetch-site": "cross-site",
        },
      }),
    );
    expect(csrfCrossSite.status).toBe(401);
  });
});
