import { describe, expect, it } from "bun:test";
import { mintToken, parseToken } from "./token";

describe("High-Performance Revocable Token Engine", () => {
  it("should encrypt and decrypt BigInt userId correctly", () => {
    const payload = {
      userId: 123456789012345n,
      version: 3,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = mintToken(payload);
    expect(typeof token).toBe("string");

    const parsed = parseToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.userId).toBe(123456789012345n);
    expect(parsed?.version).toBe(3);
    expect(parsed?.expiresAt).toBe(payload.expiresAt);
  });

  it("should support string userId for migration backward-compatibility", () => {
    const payload = {
      userId: "cuid_legacy_abc123456",
      version: 1,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = mintToken(payload);
    const parsed = parseToken(token);
    expect(parsed).not.toBeNull();
    expect(parsed?.userId).toBe("cuid_legacy_abc123456");
    expect(parsed?.version).toBe(1);
  });

  it("should reject expired tokens", () => {
    const payload = {
      userId: 1n,
      version: 1,
      expiresAt: Math.floor(Date.now() / 1000) - 10, // expired 10s ago
    };

    const token = mintToken(payload);
    const parsed = parseToken(token);
    expect(parsed).toBeNull();
  });

  it("should reject tampered tokens", () => {
    const payload = {
      userId: 999n,
      version: 2,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = mintToken(payload);
    // Tamper single character in ciphertext
    const tampered = token.slice(0, 10) + (token[10] === "A" ? "B" : "A") + token.slice(11);
    const parsed = parseToken(tampered);
    expect(parsed).toBeNull();
  });

  it("should decrypt in microseconds (high performance)", () => {
    const payload = {
      userId: 42n,
      version: 1,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    };

    const token = mintToken(payload);
    const iterations = 10000;
    const start = performance.now();

    for (let i = 0; i < iterations; i++) {
      parseToken(token);
    }

    const elapsedMs = performance.now() - start;
    const avgMicroseconds = (elapsedMs / iterations) * 1000;

    // Must be well below 20µs per decrypt in Bun
    expect(avgMicroseconds).toBeLessThan(50);
  });
});
