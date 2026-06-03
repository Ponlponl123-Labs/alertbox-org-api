import { prisma } from "@/index";

/**
 * List all active sessions/devices for a user.
 */
export async function listUserDevices(uid: bigint, currentAuthToken: string) {
  const devicesRaw = await prisma.client.sessions.findMany({
    select: {
      id: true,
      time: true,
      disabled: true,
      expire: true,
      ip_addr: true,
      user_agent: true,
      platform: true,
      platform_major: true,
      platform_ver: true,
      platform_type: true,
      cpu_architecture: true,
      device_model: true,
      device_type: true,
      device_vendor: true,
      ip_addr_asn: true,
      ip_addr_city: true,
      ip_addr_continent_code: true,
      ip_addr_country: true,
      ip_addr_country_code: true,
      ip_addr_country_code_iso3: true,
      ip_addr_isp: true,
      ip_addr_lat: true,
      ip_addr_long: true,
      ip_addr_postal: true,
      ip_addr_region: true,
      ip_addr_region_code: true,
      session_usages: {
        select: {
          time: true,
        },
        orderBy: {
          id: "desc",
        },
        take: 1,
      },
      os: true,
      os_ver: true,
      token: true,
    },
    where: {
      uid,
      disabled: null,
      expire: {
        gt: new Date(),
      },
    },
  });

  return devicesRaw.map(({ session_usages, token, ...rest }) => ({
    ...rest,
    last_used: session_usages?.[0]?.time ?? null,
    isThisDevice: token === currentAuthToken,
  }));
}

/**
 * Invalidate a specific session by its internal ID.
 */
export async function destroyUserDevice(uid: bigint, deviceId: bigint) {
  const result = await prisma.client.sessions.updateMany({
    data: {
      disabled: new Date(),
    },
    where: {
      id: deviceId,
      uid,
    },
  });

  return result.count > 0;
}
