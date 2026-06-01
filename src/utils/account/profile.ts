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
  if (t !== "noone") {
    return false;
  }
  const isURIAlreadyRegistered = await prisma.client.reserved_uri.findFirst({
    select: { uid: true },
    where: { uri },
    orderBy: { id: "desc" },
  });
  if (isURIAlreadyRegistered) {
    void redis.redis.setex(
      "uri:" + uri + ":owner",
      week,
      String(isURIAlreadyRegistered.uid),
    );
    return false;
  }

  const cooldown = new Date().getTime() + week;

  await prisma.client.reserved_uri.create({
    data: {
      uri,
      uid,
      by: token,
    },
  });
  await prisma.client.accounts.update({
    data: {
      uri,
      uri_cooldown: new Date(cooldown),
    },
    where: {
      id: uid,
    },
  });
  void redis.redis.setex("uri:" + uri + ":owner", week, String(uid));
  void redis.redis.setex(
    "uri:" + uri + ":registered_date",
    week,
    String(new Date().getTime()),
  );
  void redis.redis.setex("user:" + uid + ":uri", week, String(uri));
  void redis.redis.setex(
    "user:" + uid + ":uri_cooldown",
    week,
    String(cooldown),
  );

  return true;
}

export async function registerUriCooldown(uri: string): Promise<Date | null> {
  const t = await redis.redis.get("uri:" + uri + ":owner");
  if (t === "noone") {
    return null;
  }

  const c = await redis.redis.get("uri:" + uri + ":registered_date");
  if (c) {
    return new Date(c + week);
  }

  const lastRegisteredURI = await prisma.client.reserved_uri.findFirst({
    select: { time: true, uid: true },
    where: { uri },
    orderBy: { id: "desc" },
  });

  if (!lastRegisteredURI) {
    void redis.redis.setex("uri:" + uri + ":owner", week, "noone");
    return null;
  }

  const cooldownEnds = new Date(lastRegisteredURI.time.getTime() + week);

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

  if (cooldownEnds > new Date()) return cooldownEnds;

  return null;
}
