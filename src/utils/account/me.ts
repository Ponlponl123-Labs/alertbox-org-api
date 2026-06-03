import { prisma, redis } from "@/index";
import { accounts } from "@/generated/prisma/client";
import {
  MinimalUser,
  SessionUser,
  User,
  UserCreated,
} from "@/types/account.types";
import { nanoid } from "nanoid";
import betterConsole, { tsflag } from "ts-better-console";
import { isBearerToken } from "../bearer-token";
import { useSession } from "./session";
import { sessionUserSelect } from "@/consts/session";

export async function createAccount(
  name: string,
  email: string,
  create_with: string,
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
          create_with,
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
    select: sessionUserSelect,
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

export function filterSessionUser(user: accounts): SessionUser {
  const {
    secret,
    stripe_secret,
    bmac_secret,
    kofi_secret,
    ffp_secret,
    streamlabs_secret,
    ...safe
  } = user;
  return safe;
}

export async function getMe(
  headers: { authorization?: string | undefined },
  set: { status?: string | number },
  ip: string,
): Promise<SessionUser | null | false> {
  const token = isBearerToken(headers.authorization ?? "");
  if (!token) {
    set.status = "Bad Request";
    return false;
  }

  const me = await useSession(token, ip);
  if (!me) {
    set.status = "Unauthorized";
    return null;
  }

  return filterSessionUser(me);
}
