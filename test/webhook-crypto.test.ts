import { describe, expect, it } from "bun:test";
import crypto from "crypto";
import { verifySignature } from "../src/utils/signature";
import { webhookParser } from "../src/utils/webhook";

describe("Webhook Cryptography & Verification", () => {
  const secret = "test_super_secret_key_12345";
  const payload = JSON.stringify({
    type: "donation.created",
    data: { amount: 50, supporter_name: "Alice" },
  });

  const generateSignature = (body: string, key: string): string => {
    return crypto.createHmac("sha256", key).update(body).digest("hex");
  };

  it("should verify valid HMAC-SHA256 signature correctly", () => {
    const signature = generateSignature(payload, secret);
    expect(verifySignature(payload, secret, signature)).toBe(true);
  });

  it("should reject invalid/tampered signature", () => {
    const invalidSignature = generateSignature(payload, "wrong_secret");
    expect(verifySignature(payload, secret, invalidSignature)).toBe(false);
  });

  it("should reject tampered payload with valid original signature", () => {
    const signature = generateSignature(payload, secret);
    const tamperedPayload = JSON.stringify({
      type: "donation.created",
      data: { amount: 5000, supporter_name: "Attacker" },
    });
    expect(verifySignature(tamperedPayload, secret, signature)).toBe(false);
  });

  it("should handle length mismatch safely without throwing", () => {
    expect(verifySignature(payload, secret, "short_sig")).toBe(false);
    expect(verifySignature(payload, secret, "")).toBe(false);
  });

  it("should parse webhook request body and attach rawBody property", async () => {
    const req = new Request("http://localhost/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
    });

    const parsed = await webhookParser({ request: req });
    expect(parsed).toEqual(JSON.parse(payload));
    expect((req as Request & { rawBody: string }).rawBody).toBe(payload);
  });
});
