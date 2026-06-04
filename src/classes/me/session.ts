import { prisma } from "@/index";
import { nanoid } from "nanoid";
import { UAParser } from "ua-parser-js";
import { get_IPGeolocation } from "@/utils/ip";
import betterConsole, { tsflag } from "ts-better-console";
import { SessionMetadata } from "@/types/me.types";

/**
 * Track a session usage event in the database.
 */
export async function trackSessionUsage(
  uid: string,
  sessionId: string,
  ip: string,
) {
  return prisma.client.sessionUsage
    .create({
      data: {
        userId: uid,
        sessionId: sessionId,
        ipAddress: ip,
      },
    })
    .catch((error) => {
      betterConsole.error(
        tsflag(
          "error",
          true,
          `[Prisma > sessionUsage.create] Background insert failed: ${error}`,
        ),
      );
    });
}

/**
 * Create a new session in the database.
 */
export async function createSession(
  uid: string,
  metadata: SessionMetadata,
): Promise<string | false> {
  const user = await prisma.client.user.findFirst({
    select: {
      id: true,
      secret: true,
    },
    where: {
      id: uid,
      disabledAt: null,
      deletedAt: null,
    },
  });

  if (!user) return false;

  const useragent = UAParser(metadata.userAgent);
  const ip_geo = await get_IPGeolocation(metadata.ipAddress);

  const payload = {
    userId: user.id,
    userSecret: user.secret,
    ipAddress: metadata.ipAddress,
    method: metadata.method,
    userAgent: metadata.userAgent,
    os: useragent.os.name,
    osVersion: useragent.os.version,
    platform: useragent.browser.name,
    platformVersion: useragent.browser.version,
    platformMajor: useragent.browser.major,
    platformType: useragent.browser.type,
    deviceModel: useragent.device.model,
    deviceType: useragent.device.type,
    deviceVendor: useragent.device.vendor,
    cpuArchitecture: useragent.cpu.architecture,
    city: ip_geo ? ip_geo.city : null,
    asn: ip_geo ? ip_geo.asn : null,
    country: ip_geo ? ip_geo.country_name : null,
    countryCode: ip_geo ? ip_geo.country_code : null,
    countryCodeIso3: ip_geo ? ip_geo.country_code_iso3 : null,
    continentCode: ip_geo ? ip_geo.continent_code : null,
    isp: ip_geo ? ip_geo.org : null,
    latitude: ip_geo ? ip_geo.latitude : null,
    longitude: ip_geo ? ip_geo.longitude : null,
    postal: ip_geo ? ip_geo.postal : null,
    region: ip_geo ? ip_geo.region : null,
    regionCode: ip_geo ? ip_geo.region_code : null,
  };

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const timestamp = Date.now();
    const combinedToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;
    try {
      await prisma.client.session.create({
        data: {
          ...payload,
          token: combinedToken,
          expiresAt: new Date(timestamp + 2 * 60 * 60 * 1000),
        },
      });
      return combinedToken;
    } catch (error: any) {
      if (error?.code === "P2002") {
        attempts++;
        betterConsole.warn(
          tsflag(
            "warn",
            true,
            `[Prisma > createSession] Collision for token. Retrying...`,
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
    const result = await prisma.client.session.update({
      data: {
        disabledAt: new Date(),
      },
      where: {
        token,
      },
    });
    return !!result;
  } catch {
    return false;
  }
}
