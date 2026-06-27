import crypto from "crypto";

/**
 * Constant-time comparison to prevent timing attacks.
 *
 * @param rawBody - The raw request body string.
 * @param secret - The configuration secret key.
 * @param signature - The signature sent in webhook headers.
 * @returns Whether the computed HMAC matches the provided signature.
 */
export function verifySignature(
  rawBody: string,
  secret: string,
  signature: string,
): boolean {
  const computed = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const computedBuf = Buffer.from(computed);
  const signatureBuf = Buffer.from(signature);

  if (computedBuf.length !== signatureBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(computedBuf, signatureBuf);
}
