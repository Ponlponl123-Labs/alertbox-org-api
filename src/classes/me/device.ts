import { prisma } from "@/core/prisma";

/**
 * List all active sessions/devices for a user.
 */
export async function listUserDevices(uid: string | bigint, currentAuthToken: string) {
  let targetUid: bigint;
  try {
    targetUid = BigInt(uid);
  } catch {
    return [];
  }

  const devicesRaw = await prisma.client.session.findMany({
    select: {
      id: true,
      createdAt: true,
      ipAddress: true,
      os: true,
      osVersion: true,
      platform: true,
      platformVersion: true,
      cpuArchitecture: true,
      isp: true,
      city: true,
      region: true,
      country: true,
      latitude: true,
      longitude: true,
      token: true,
      sessionUsages: {
        select: {
          createdAt: true,
        },
        orderBy: {
          id: "desc",
        },
        take: 1,
      },
    },
    where: {
      userId: targetUid,
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
export async function destroyUserDevice(uid: string | bigint, deviceId: string | bigint) {
  let targetUid: bigint;
  let targetDeviceId: bigint;
  try {
    targetUid = BigInt(uid);
    targetDeviceId = BigInt(deviceId);
  } catch {
    return false;
  }

  const result = await prisma.client.session.updateMany({
    data: {
      disabledAt: new Date(),
    },
    where: {
      id: targetDeviceId,
      userId: targetUid,
    },
  });

  return result.count > 0;
}
