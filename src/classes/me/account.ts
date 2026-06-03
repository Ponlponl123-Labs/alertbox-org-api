import { prisma, redis } from "@/index";
import { day } from "@/consts/time";
import { MinimalUser } from "@/types/account.types";
import { nanoid } from "nanoid";
import betterConsole, { tsflag } from "ts-better-console";

/**
 * Create a new account in the database.
 */
export async function createAccount(data: { name: string; email: string; create_with: string }) {
  const isAccountExist = await isExist(data.email);
  if (isAccountExist) return false;

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const timestamp = Date.now();
    const combinedToken = `${nanoid(32)}.${timestamp}.${nanoid(32)}`;
    const widgetId = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;
    try {
      const user = await prisma.client.accounts.create({
        data: {
          ...data,
          displayname: data.name,
          secret: combinedToken,
          widget_id: widgetId,
        },
      });
      return user;
    } catch (error: any) {
      if (error?.code === "P2002") {
        attempts++;
        betterConsole.warn(
          tsflag("warn", true, `[Prisma > createAccount] Collision for ${combinedToken}. Retrying...`),
        );
      } else {
        throw error;
      }
    }
  }

  throw new Error("Failed to generate a unique token after multiple attempts.");
}

/**
 * Check if an account exists by email, with caching.
 */
export async function isExist(email: string): Promise<MinimalUser | null> {
  const c = await redis.redis.get("email:" + email);
  if (c) {
    if (c === "deleted") return null;
    return JSON.parse(c);
  }
  const exist_user = await prisma.client.accounts.findFirst({
    select: {
      id: true,
      disabled: true,
      deleted: true,
    },
    where: {
      email,
    },
  });
  if (exist_user?.deleted) {
    redis.redis.setex("email:" + email, day, "deleted");
    return null;
  }
  if (exist_user) {
    redis.redis.setex("email:" + email, day, JSON.stringify(exist_user));
  }
  return exist_user;
}

/**
 * Mark an account as deleted and clean up caches.
 */
export async function deleteAccount(uid: bigint, email: string) {
  const updated = await prisma.client.accounts.update({
    data: {
      deleted: new Date(),
    },
    where: {
      id: uid,
    },
  });

  // Cleanup Caches
  await Promise.all([
    redis.redis.del(`user:${uid}:info`),
    redis.redis.del(`email:${email}`),
  ]);

  return updated;
}
