import crypto from "node:crypto";

export interface TokenPayload {
  userId: bigint | string;
  version: number;
  expiresAt: number; // Unix timestamp in seconds
}

const TOKEN_MASTER_SECRET = process.env.TOKEN_MASTER_SECRET;
if (!TOKEN_MASTER_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("FATAL: TOKEN_MASTER_SECRET environment variable is missing!");
}

const DEFAULT_SECRET = TOKEN_MASTER_SECRET || "alertbox-org-super-secure-master-key-32b!";
const MASTER_KEY = crypto.createHash("sha256").update(DEFAULT_SECRET).digest();

/**
 * Packs payload into a compact Buffer:
 * - 1 byte type flag (0x01 = BigInt uint64, 0x02 = String UTF-8)
 * - 4 bytes expiresAt (uint32be)
 * - 2 bytes version (uint16be)
 * - N bytes userId data
 */
function packPayload(payload: TokenPayload): Buffer {
  const isBigInt = typeof payload.userId === "bigint";
  const userBuf = isBigInt
    ? (() => {
      const b = Buffer.allocUnsafe(8);
      b.writeBigUInt64BE(payload.userId as bigint, 0);
      return b;
    })()
    : Buffer.from(payload.userId as string, "utf8");

  const header = Buffer.allocUnsafe(7);
  header.writeUInt8(isBigInt ? 0x01 : 0x02, 0);
  header.writeUInt32BE(payload.expiresAt, 1);
  header.writeUInt16BE(payload.version & 0xffff, 5);

  return Buffer.concat([header, userBuf]);
}

/**
 * Unpacks Buffer back to TokenPayload:
 */
function unpackPayload(buf: Buffer): TokenPayload | null {
  if (buf.length < 7) return null;
  const typeFlag = buf.readUInt8(0);
  const expiresAt = buf.readUInt32BE(1);
  const version = buf.readUInt16BE(5);

  let userId: bigint | string;
  if (typeFlag === 0x01) {
    if (buf.length < 15) return null;
    userId = buf.readBigUInt64BE(7);
  } else if (typeFlag === 0x02) {
    userId = buf.subarray(7).toString("utf8");
  } else {
    return null;
  }

  return { userId, version, expiresAt };
}

/**
 * Encrypts payload with AES-256-GCM.
 * Layout: [12B IV] + [16B AuthTag] + [Ciphertext] -> Base64URL
 */
export function mintToken(
  payload: TokenPayload,
  key: Buffer = MASTER_KEY,
): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const packed = packPayload(payload);
  const ciphertext = Buffer.concat([cipher.update(packed), cipher.final()]);
  const tag = cipher.getAuthTag();

  const combined = Buffer.concat([iv, tag, ciphertext]);
  return combined.toString("base64url");
}

/**
 * Verifies and decrypts token with AES-256-GCM.
 * Returns payload or null if invalid/expired/tampered.
 */
export function parseToken(
  tokenStr: string,
  key: Buffer = MASTER_KEY,
): TokenPayload | null {
  try {
    if (!tokenStr || typeof tokenStr !== "string") return null;
    const raw = Buffer.from(tokenStr, "base64url");
    if (raw.length < 28 + 7) return null; // 12 IV + 16 Tag + min 7 Payload

    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ciphertext = raw.subarray(28);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

    const payload = unpackPayload(decrypted);
    if (!payload) return null;

    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.expiresAt < nowSec) return null;

    return payload;
  } catch {
    return null;
  }
}
