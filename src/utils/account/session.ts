import { prisma, redis } from "@/index";
import { nanoid } from "nanoid";
import betterConsole, { tsflag } from "ts-better-console";
import { UAParser } from "ua-parser-js";
import { get_IPGeolocation } from "../ip";
import { day } from "@/consts/time";
import { SessionUser } from "@/types/account.types";

export async function createSession(
  uid: bigint,
  metadata: {
    method: string;
    user_agent: string;
    ip_addr: string;
  },
): Promise<string | false> {
  const user_secret = await prisma.client.accounts.findFirst({
    select: {
      secret: true,
    },
    where: {
      id: uid,
      AND: {
        disabled: null,
        AND: {
          deleted: null,
        },
      },
    },
  });

  if (!user_secret) return false;

  let attempts = 0;
  const maxAttempts = 5;
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
      // Prisma error code P2002 corresponds to a unique constraint violation
      if (error?.code === "P2002") {
        attempts++;
        betterConsole.warn(
          tsflag(
            "warn",
            true,
            `[Prisma > createAccount] Collision detected for token ${combinedToken}. Retrying...`,
          ),
        );
      } else {
        throw error;
      }
    }
  }

  throw new Error("Failed to generate a unique token after multiple attempts.");
  return false;
}

export async function destroySession(session: string): Promise<boolean> {
  const session_info = await prisma.client.sessions.findFirst({
    where: {
      token: session,
      AND: {
        disabled: null,
      },
    },
  });
  if (!session_info) return false;
  try {
    await prisma.client.sessions.update({
      data: {
        disabled: new Date(),
      },
      where: {
        token: session,
      },
    });
  } catch {
    return false;
  }
  return true;
}

export async function useSession(
  session: string,
  ip: string,
  useCache = true,
): Promise<false | null | SessionUser> {
  const session_info = await prisma.client.sessions.findFirst({
    where: {
      token: session,
      disabled: null,
      expire: {
        gt: new Date(),
      },
    },
  });
  if (!session_info) return false;
  void prisma.client.session_usages
    .create({
      data: {
        uid: session_info.uid,
        secret: session_info.secret,
        token: session,
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
  if (session_info.ip_addr !== ip) {
    void destroySession(session);
    return false;
  }

  if (useCache) {
    const c = await redis.redis.get("user:" + session_info.uid + ":info");
    if (c) {
      if (c === "deleted") return false;
      return JSON.parse(c) as SessionUser;
    }
  }

  const userRow = await prisma.client.accounts.findFirst({
    where: {
      id: session_info.uid,
    },
  });
  if (!userRow) return null;

  const { secret, ...user } = userRow;

  if (user.deleted) {
    redis.redis.setex("user:" + session_info.uid + ":info", day, "deleted");
    return false;
  }

  redis.redis.setex(
    "user:" + session_info.uid + ":info",
    day,
    JSON.stringify(user),
  );
  if (user?.uri)
    redis.redis.setex("user:" + session_info.uid + ":uri", day, user?.uri);
  if (user?.uri_cooldown)
    redis.redis.setex(
      "user:" + session_info.uid + ":uri_cooldown",
      day,
      String(user?.uri_cooldown.getTime()),
    );

  return user;
}
