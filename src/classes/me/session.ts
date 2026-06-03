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
  uid: bigint,
  secret: string,
  token: string,
  ip: string,
) {
  return prisma.client.session_usages
    .create({
      data: {
        uid,
        secret,
        token,
        ip_addr: ip,
        time: new Date(),
      },
    })
    .catch((error) => {
      betterConsole.error(
        tsflag(
          "error",
          true,
          `[Prisma > session_usages.create] Background insert failed: ${error}`,
        ),
      );
    });
}

/**
 * Create a new session in the database.
 */
export async function createSession(
  uid: bigint,
  metadata: SessionMetadata,
): Promise<string | false> {
  const user_secret = await prisma.client.accounts.findFirst({
    select: {
      secret: true,
    },
    where: {
      id: uid,
      disabled: null,
      deleted: null,
    },
  });

  if (!user_secret) return false;

  const useragent = UAParser(metadata.user_agent);
  const ip_geo = await get_IPGeolocation(metadata.ip_addr);
  const payload = {
    uid,
    secret: user_secret.secret,
    ip_addr: metadata.ip_addr,
    method: metadata.method,
    user_agent: metadata.user_agent,
    os: useragent.os.name,
    os_ver: useragent.os.version,
    platform: useragent.browser.name,
    platform_ver: useragent.browser.version,
    platform_major: useragent.browser.major,
    platform_type: useragent.browser.type,
    device_model: useragent.device.model,
    device_type: useragent.device.type,
    device_vendor: useragent.device.vendor,
    cpu_architecture: useragent.cpu.architecture,
    ip_addr_city: ip_geo ? ip_geo.city : null,
    ip_addr_asn: ip_geo ? ip_geo.asn : null,
    ip_addr_country: ip_geo ? ip_geo.country_name : null,
    ip_addr_country_code: ip_geo ? ip_geo.country_code : null,
    ip_addr_country_code_iso3: ip_geo ? ip_geo.country_code_iso3 : null,
    ip_addr_continent_code: ip_geo ? ip_geo.continent_code : null,
    ip_addr_isp: ip_geo ? ip_geo.org : null,
    ip_addr_lat: ip_geo ? ip_geo.latitude : null,
    ip_addr_long: ip_geo ? ip_geo.longitude : null,
    ip_addr_postal: ip_geo ? ip_geo.postal : null,
    ip_addr_region: ip_geo ? ip_geo.region : null,
    ip_addr_region_code: ip_geo ? ip_geo.region_code : null,
  };

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const timestamp = Date.now();
    const combinedToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;
    try {
      await prisma.client.sessions.create({
        data: {
          ...payload,
          token: combinedToken,
          time: new Date(timestamp),
          expire: new Date(timestamp + 2 * 60 * 60 * 1000),
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
            `[Prisma > createSession] Collision for ${combinedToken}. Retrying...`,
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
    const result = await prisma.client.sessions.update({
      data: {
        disabled: new Date(),
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
