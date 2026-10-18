import { db } from "@/db";
import { sql } from "kysely";
import { nanoid } from "nanoid";
import { UAParser } from "ua-parser-js";
import { get_IPGeolocation } from "@/utils/ip";
import betterConsole, { tsflag } from "ts-better-console";
import { SessionMetadata } from "@/types/me.types";

/**
 * Track a session usage event in the database.
 */
export async function trackSessionUsage(
  uid: string | bigint | number,
  sessionId: string | bigint | number,
  ip: string,
) {
  return db
    .insertInto("SessionUsage")
    .values({
      userId: Number(uid),
      sessionId: Number(sessionId),
      ipAddress: ip,
    })
    .executeTakeFirst()
    .catch((error) => {
      betterConsole.error(
        tsflag(
          "error",
          true,
          `[SessionUsage > create] Background insert failed: ${error}`,
        ),
      );
    });
}

/**
 * Create a new session in the database.
 */
export async function createSession(
  uid: string | bigint | number,
  metadata: SessionMetadata,
): Promise<string | false> {
  let targetUid: bigint;
  try {
    targetUid = BigInt(uid);
  } catch {
    return false;
  }

  const user = await db
    .selectFrom("User")
    .where("id", "=", Number(targetUid))
    .select(["id", "secret", "disabledAt", "deletedAt"])
    .executeTakeFirst();

  if (!user || user.disabledAt || user.deletedAt) return false;

  const useragent = UAParser(metadata.userAgent);
  const ip_geo = await get_IPGeolocation(metadata.ipAddress);

  const payload = {
    userId: user.id,
    userSecret: user.secret,
    ipAddress: metadata.ipAddress,
    method: metadata.method,
    userAgent: metadata.userAgent,
    os: useragent.os.name ?? null,
    osVersion: useragent.os.version ?? null,
    platform: useragent.browser.name ?? null,
    platformVersion: useragent.browser.version ?? null,
    platformMajor: useragent.browser.major ?? null,
    platformType: useragent.browser.type ?? null,
    deviceModel: useragent.device.model ?? null,
    deviceType: useragent.device.type ?? null,
    deviceVendor: useragent.device.vendor ?? null,
    cpuArchitecture: useragent.cpu.architecture ?? null,
    city: ip_geo ? ip_geo.city : null,
    asn: ip_geo ? ip_geo.asn?.asn : null,
    country: ip_geo ? ip_geo.country?.name : null,
    countryCode: ip_geo ? ip_geo.country?.code : null,
    continent: ip_geo ? ip_geo.continent?.name : null,
    continentCode: ip_geo ? ip_geo.continent?.code : null,
    isp: ip_geo ? ip_geo.asn?.name : null,
    latitude: ip_geo && "latitude" in ip_geo && ip_geo.latitude ? String(ip_geo.latitude) : null,
    longitude: ip_geo && "longitude" in ip_geo && ip_geo.longitude ? String(ip_geo.longitude) : null,
    postal: ip_geo ? ip_geo.postal_code : null,
    region: ip_geo ? ip_geo.region?.name : null,
    regionCode: ip_geo ? ip_geo.region?.code : null,
    timezone: ip_geo ? ip_geo.timezone : null,
    isMobile: ip_geo ? (ip_geo.is_mobile ? 1 : 0) : null,
    isProxy: ip_geo ? (ip_geo.is_proxy ? 1 : 0) : null,
    isHosting: ip_geo ? (ip_geo.is_hosting ? 1 : 0) : null,
    ipVersion: ip_geo ? ip_geo.ip_version : null,
    isAnonymous: ip_geo ? (ip_geo.is_anonymous ? 1 : 0) : null,
    isAnycast: ip_geo ? (ip_geo.is_anycast ? 1 : 0) : null,
    isSatellite: ip_geo ? (ip_geo.is_satellite ? 1 : 0) : null,
    isRelay: ip_geo ? (ip_geo.is_relay ? 1 : 0) : null,
    isTor: ip_geo ? (ip_geo.is_tor ? 1 : 0) : null,
    isVpn: ip_geo ? (ip_geo.is_vpn ? 1 : 0) : null,
    isResProxy: ip_geo ? (ip_geo.is_res_proxy ? 1 : 0) : null,
  };

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const timestamp = Date.now();
    const combinedToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;
    try {
      await db
        .insertInto("Session")
        .values({
          ...payload,
          token: combinedToken,
          expiresAt: sql`DATE_ADD(NOW(), INTERVAL 7 DAY)` as any,
        })
        .execute();
      return combinedToken;
    } catch (error: any) {
      if (
        error?.code === "ER_DUP_ENTRY" ||
        error?.errno === 1062 ||
        error?.code === "P2002"
      ) {
        attempts++;
        betterConsole.warn(
          tsflag(
            "warn",
            true,
            `[Kysely > createSession] Collision for token. Retrying...`,
          ),
        );
      } else {
        throw error;
      }
    }
  }

  throw new Error("Failed to generate a unique token after multiple attempts.");
}

/**
 * Invalidate a session by setting its disabled timestamp.
 */
export async function destroySession(token: string): Promise<boolean> {
  try {
    const result = await db
      .updateTable("Session")
      .set({
        disabledAt: sql`NOW()` as any,
      })
      .where("token", "=", token)
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0) > 0;
  } catch {
    return false;
  }
}
