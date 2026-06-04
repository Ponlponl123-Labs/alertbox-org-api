import { prisma } from "@/index";

/**
 * List all active sessions/devices for a user.
 */
export async function listUserDevices(uid: string, currentAuthToken: string) {
  const devicesRaw = await prisma.client.session.findMany({
    select: {
      id: true,
      createdAt: true,
      disabledAt: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
      platform: true,
      platformMajor: true,
      platformVersion: true,
      platformType: true,
      cpuArchitecture: true,
      deviceModel: true,
      deviceType: true,
      deviceVendor: true,
      asn: true,
      city: true,
      continentCode: true,
      country: true,
      countryCode: true,
      countryCodeIso3: true,
      isp: true,
      latitude: true,
      longitude: true,
      postal: true,
      region: true,
      regionCode: true,
      sessionUsages: {
        select: {
          createdAt: true,
        },
        orderBy: {
          id: "desc",
        },
        take: 1,
      },
      os: true,
      osVersion: true,
      token: true,
    },
    where: {
      userId: uid,
      disabledAt: null,
      expiresAt: {
        gt: new Date(),
      },
    },
  });

  return devicesRaw.map(({ sessionUsages, token, ...rest }) => ({
    ...rest,
    lastUsed: sessionUsages?.[0]?.createdAt ?? null,
    isThisDevice: token === currentAuthToken,
  }));
}

/**
 * Invalidate a specific session by its internal ID.
 */
export async function destroyUserDevice(uid: string, deviceId: string) {
  const result = await prisma.client.session.updateMany({
    data: {
      disabledAt: new Date(),
    },
    where: {
      id: deviceId,
      userId: uid,
    },
  });

  return result.count > 0;
}
