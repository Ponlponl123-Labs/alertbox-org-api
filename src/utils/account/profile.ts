import { prisma, redis } from "@/index";
import { isValidUri } from "../regex";
import { week } from "@/consts/time";

export async function registerURI(
  uid: bigint,
  uri: string,
  token: string,
): Promise<boolean> {
  if (!isValidUri(uri)) return false;

  const t = await redis.redis.get("uri:" + uri + ":owner");
  if (t && t !== "noone") {
    return false;
  }

  const isURIAlreadyRegistered = await prisma.client.reserved_uri.findFirst({
    select: { uid: true, time: true, disabled: true },
    where: { uri },
    orderBy: { id: "desc" },
  });

  if (isURIAlreadyRegistered) {
    if (isURIAlreadyRegistered.disabled) {
      void redis.redis.setex("uri:" + uri + ":owner", week, "disabled");
    } else {
      void redis.redis.setex(
        "uri:" + uri + ":owner",
        week,
        String(isURIAlreadyRegistered.uid),
      );
    }
    return false;
  }

  const cooldown = new Date(Date.now() + week);

  try {
    await prisma.client.$transaction(async (tx) => {
      await tx.reserved_uri.create({
        data: {
          uri,
          uid,
          by: token,
        },
      });

      await tx.accounts.update({
        data: {
          uri,
          uri_cooldown: cooldown,
        },
        where: {
          id: uid,
        },
      });
    });

    const now = Date.now();
    await Promise.all([
      redis.redis.setex("uri:" + uri + ":owner", week, String(uid)),
      redis.redis.setex("uri:" + uri + ":registered_date", week, String(now)),
      redis.redis.setex("user:" + uid + ":uri", week, uri),
      redis.redis.setex(
        "user:" + uid + ":uri_cooldown",
        week,
        String(cooldown.getTime()),
      ),
      redis.redis.del("user:" + uid + ":info"),
    ]);

    return true;
  } catch (err) {
    console.error("Failed to register URI:", err);
    return false;
  }
}

export async function registeredUri(uri: string): Promise<bigint | false> {
  const t = await redis.redis.get("uri:" + uri + ":owner");

  if (t === "noone" || t === "disabled") {
    return false;
  }

  if (t) {
    try {
      return BigInt(t);
    } catch {
      // Fallback to DB if cache is corrupted
    }
  }

  const lastRegisteredURI = await prisma.client.reserved_uri.findFirst({
    select: { time: true, uid: true, disabled: true },
    where: { uri },
    orderBy: { id: "desc" },
  });

  if (!lastRegisteredURI) {
    void redis.redis.setex("uri:" + uri + ":owner", week, "noone");
    return false;
  } else if (lastRegisteredURI.disabled) {
    void redis.redis.setex("uri:" + uri + ":owner", week, "disabled");
    void redis.redis.setex(
      "uri:" + uri + ":registered_date",
      week,
      String(lastRegisteredURI.time.getTime()),
    );
    return false;
  }

  void redis.redis.setex(
    "uri:" + uri + ":owner",
    week,
    String(lastRegisteredURI.uid),
  );
  void redis.redis.setex(
    "uri:" + uri + ":registered_date",
    week,
    String(lastRegisteredURI.time.getTime()),
  );

  return lastRegisteredURI.uid;
}
