import crypto from "crypto";
import { AlertEventType } from "@/generated/prisma/client";
import { StreamlabsOption } from "@/consts/integration";
import type { KofiPayload } from "@/types/webhook.types";

/**
 * Generate a unique pseudo-random test transaction identifier.
 */
export function generateTestTransactionId(rawTxId: string): string {
  return `${rawTxId}_test_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

/**
 * Parses Ko-fi incoming body from JSON or URL-encoded form data "data" field.
 */
export function parseKofiPayload(body: any): KofiPayload | null {
  if (!body) return null;
  if (body.data) {
    return typeof body.data === "string" ? JSON.parse(body.data) : body.data;
  }
  return body;
}

/**
 * Determine if a Ko-fi payload represents a test transaction.
 */
export function isKofiTest(rawTxId: string, payload: KofiPayload): boolean {
  return (
    rawTxId === "00000000-1111-2222-3333-444444444444" ||
    rawTxId === "12345678-1234-1234-1234-1234567890ab" ||
    rawTxId.startsWith("00000000-1111") ||
    rawTxId.startsWith("12345678-1234") ||
    rawTxId.toLowerCase().includes("test") ||
    payload.from_name === "Ko-fi Team" ||
    payload.from_name === "Test Supporter" ||
    payload.from_name === "Jo Example" ||
    (typeof payload.email === "string" && payload.email.includes("example.com")) ||
    (payload.is_public === false &&
      typeof payload.from_name === "string" &&
      payload.from_name.toLowerCase().includes("test"))
  );
}

/**
 * Determine if a BMAC payload represents a test transaction.
 */
export function isBmacTest(
  rawTxId: string,
  liveMode?: boolean,
  supporterName?: string | null,
): boolean {
  return (
    !liveMode ||
    rawTxId === "1" ||
    rawTxId === "0" ||
    rawTxId.toLowerCase().includes("test") ||
    (typeof supporterName === "string" && supporterName.toLowerCase().includes("test"))
  );
}

/**
 * Map Ko-fi payload type to AlertEventType and corresponding StreamlabsOption bitmask flag.
 */
export function resolveKofiEventType(payload: KofiPayload): {
  alertType: AlertEventType;
  optionFlag: number;
} {
  if (payload.is_subscription_payment || payload.type === "Subscription") {
    return {
      alertType: AlertEventType.MEMBERSHIP,
      optionFlag: StreamlabsOption.KOFI_DONATION_SUCCESS,
    };
  }

  if (payload.shop_items || payload.type === "Shop Order") {
    return {
      alertType: AlertEventType.MERCH,
      optionFlag: StreamlabsOption.KOFI_PURCHASE_SUCCESS,
    };
  }

  return {
    alertType: AlertEventType.TIP,
    optionFlag: StreamlabsOption.KOFI_DONATION_SUCCESS,
  };
}

/**
 * Elysia parser to capture raw string body before JSON serialization for webhook HMAC verification.
 */
export const webhookParser = async ({ request }: { request: Request }) => {
  const text = await request.text();
  Object.defineProperty(request, "rawBody", {
    value: text,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return JSON.parse(text);
};
