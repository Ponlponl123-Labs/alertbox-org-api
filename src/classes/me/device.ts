import { db } from "@/db";
import { redis } from "@/core/redis";
import { hashSessionToken } from "./session";

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

  const sessions = await db
    .selectFrom("Session")
    .where("userId", "=", Number(targetUid))
    .where("disabledAt", "is", null)
    .where("expiresAt", ">", new Date())
    .select([
      "id",
      "createdAt",
      "ipAddress",
      "os",
      "osVersion",
      "platform",
      "platformVersion",
      "cpuArchitecture",
      "isp",
      "city",
      "region",
      "country",
      "latitude",
      "longitude",
      "token",
    ])
    .execute();

  if (sessions.length === 0) return [];

  const sessionIds = sessions.map((s) => s.id);
  const latestUsages = await db
    .selectFrom("SessionUsage")
    .where("sessionId", "in", sessionIds)
    .select(["sessionId", "createdAt"])
    .orderBy("id", "desc")
    .execute();

  const usageMap = new Map<string, Date>();
  for (const u of latestUsages) {
    const key = String(u.sessionId);
    if (!usageMap.has(key)) {
      usageMap.set(key, new Date(u.createdAt));
    }
  }

  return sessions.map(({ token, ...rest }) => ({
    ...rest,
    lastUsed: usageMap.get(String(rest.id)) ?? null,
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

  const existing = await db
    .selectFrom("Session")
    .select(["token"])
    .where("id", "=", Number(targetDeviceId))
    .where("userId", "=", Number(targetUid))
    .executeTakeFirst();

  const result = await db
    .updateTable("Session")
    .set({
      disabledAt: new Date(),
    })
    .where("id", "=", Number(targetDeviceId))
    .where("userId", "=", Number(targetUid))
    .executeTakeFirst();

  const updated = Number(result.numUpdatedRows ?? 0) > 0;
  if (updated && existing?.token && redis.redis.status === "ready") {
    await redis.redis.del(`sess:${hashSessionToken(existing.token)}`).catch(() => {});
  }

  return updated;
}
