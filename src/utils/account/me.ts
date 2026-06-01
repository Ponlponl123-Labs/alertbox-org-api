import { prisma, redis } from "@/index";
import { MinimalUser, User, UserCreated } from "@/types/account.types";
import { nanoid } from "nanoid";
import betterConsole, { tsflag } from "ts-better-console";

export async function createAccount(
  name: string,
  email: string,
): Promise<UserCreated | false> {
  const isAccountExist = await isExist(email);
  if (isAccountExist) return false;

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const timestamp = Date.now();
    const combinedToken = `${nanoid(32)}.${timestamp}.${nanoid(32)}`;
    try {
      const user = await prisma.client.accounts.create({
        data: {
          name,
          email,
          displayname: name,
          secret: combinedToken,
        },
      });

      return {
        id: user.id,
        secret: combinedToken,
      };
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

export async function getUid(uid: bigint): Promise<User | null> {
  const c = await redis.redis.get("user:" + uid + ":info");
  if (c) {
    if (c === "deleted") return null;
    return JSON.parse(c);
  }
  const exist_user = await prisma.client.accounts.findFirst({
    select: {
      id: true,
      name: true,
      email: true,
      displayname: true,
      uri: true,
      avatar: true,
      banner: true,
      deleted: true,
      disabled: true,
      ffp_secret: false,
      bmac_secret: false,
      kofi_secret: false,
      stripe_secret: false,
    },
    where: {
      id: uid,
    },
  });
  if (exist_user?.deleted) {
    redis.redis.setex("user:" + uid + ":info", 24 * 60 * 60 * 1000, "deleted");
    return null;
  }

  const normalizedUser = exist_user
    ? {
        ...exist_user,
        uri: exist_user.uri ?? "",
      }
    : null;

  if (normalizedUser) {
    redis.redis.setex(
      "user:" + uid + ":info",
      24 * 60 * 60 * 1000,
      JSON.stringify(normalizedUser),
    );
  }

  return normalizedUser;
}

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
    redis.redis.setex("email:" + email, 24 * 60 * 60 * 1000, "deleted");
    return null;
  }
  if (exist_user) {
    redis.redis.setex(
      "email:" + email,
      24 * 60 * 60 * 1000,
      JSON.stringify(exist_user),
    );
  }
  return exist_user;
}
