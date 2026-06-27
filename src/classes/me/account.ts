import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { day } from "@/consts/time";
import { MinimalUser } from "@/types/account.types";
import { nanoid } from "nanoid";
import betterConsole, { tsflag } from "ts-better-console";
import { DEFAULT_ALERTBOX_EVENTS } from "@/consts/widget";

/**
 * Create a new user in the database with associated profile and highly customized modular widgets.
 */
export async function createAccount(data: {
  name: string;
  email: string;
  createWith: string;
}) {
  const isAccountExist = await isExist(data.email);
  if (isAccountExist) return false;

  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    const timestamp = Date.now();
    const internalSecret = `${nanoid(32)}.${timestamp}.${nanoid(32)}`;
    const widgetToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;

    try {
      const user = await prisma.client.user.create({
        data: {
          email: data.email,
          createWith: data.createWith,
          secret: internalSecret,
          profile: {
            create: {
              name: data.name,
              displayName: data.name,
            },
          },
          widgets: {
            create: {
              type: "ALERTBOX",
              token: widgetToken,
              alertbox: {
                create: {
                  events: {
                    createMany: {
                      data: DEFAULT_ALERTBOX_EVENTS,
                    },
                  },
                },
              },
            },
          },
        },
        include: {
          profile: true,
          widgets: {
            include: {
              alertbox: {
                include: {
                  events: true,
                },
              },
            },
          },
        },
      });
      return user;
    } catch (error: any) {
      if (error?.code === "P2002") {
        const target = error?.meta?.target;
        const isEmailCollision = Array.isArray(target)
          ? target.includes("email")
          : typeof target === "string"
          ? target.includes("email")
          : false;

        if (isEmailCollision) {
          return false;
        }

        attempts++;
        betterConsole.warn(
          tsflag(
            "warn",
            true,
            `[Prisma > createAccount] Collision for secret/widget token. Retrying...`,
          ),
        );
      } else {
        throw error;
      }
    }
  }

  throw new Error("Failed to create user after multiple attempts.");
}

/**
 * Check if a user exists by email, with caching.
 */
export async function isExist(email: string): Promise<MinimalUser | null> {
  const cacheKey = `email:${email}`;
  const cached = await redis.redis.get(cacheKey);

  if (cached) {
    if (cached === "deleted") return null;
    return JSON.parse(cached);
  }

  const user = await prisma.client.user.findFirst({
    select: {
      id: true,
      disabledAt: true,
      deletedAt: true,
    },
    where: {
      email,
    },
  });

  if (user?.deletedAt) {
    await redis.redis.setex(cacheKey, day, "deleted");
    return null;
  }

  if (user) {
    await redis.redis.setex(cacheKey, day, JSON.stringify(user));
  }

  return user;
}

/**
 * Mark a user as deleted, release unique fields (email, secret, profile URI, reserved URIs), and clean up caches.
 */
export async function deleteAccount(uid: string, email: string) {
  const timestamp = Date.now();

  const user = await prisma.client.user.findUnique({
    where: { id: uid },
    include: {
      profile: true,
      reservedUris: {
        where: { deletedAt: null },
      },
    },
  });

  if (!user) {
    throw new Error("User not found");
  }

  const deletedEmail = `deleted-${timestamp}-${email}`.slice(0, 256);
  const deletedSecret = `deleted-${timestamp}-${user.secret}`.slice(0, 255);

  const profileUpdate: any = {
    deletedAt: new Date(),
  };
  if (user.profile?.uri) {
    profileUpdate.uri = `deleted-${timestamp}-${user.profile.uri}`.slice(0, 64);
  }

  const updated = await prisma.client.$transaction(async (tx) => {
    // Release active reserved URIs by suffixing them and marking as deleted
    for (const reserved of user.reservedUris) {
      await tx.reservedUri.update({
        where: { id: reserved.id },
        data: {
          uri: `deleted-${timestamp}-${reserved.uri}`.slice(0, 50),
          deletedAt: new Date(),
        },
      });
    }

    const userData: any = {
      email: deletedEmail,
      secret: deletedSecret,
      deletedAt: new Date(),
    };

    if (user.profile) {
      userData.profile = {
        update: profileUpdate,
      };
    }

    return await tx.user.update({
      where: { id: uid },
      data: userData,
    });
  });

  // Cleanup Caches
  const cacheCleanup: Promise<any>[] = [
    redis.redis.del(`user:${uid}:info`),
    redis.redis.del(`email:${email}`),
  ];

  if (user.profile?.uri) {
    cacheCleanup.push(redis.redis.del(`uri:${user.profile.uri.toLowerCase()}:owner`));
  }
  for (const reserved of user.reservedUris) {
    cacheCleanup.push(redis.redis.del(`uri:${reserved.uri.toLowerCase()}:owner`));
  }

  await Promise.all(cacheCleanup);

  return updated;
}

/**
 * Safely self-heals/provisions a default ALERTBOX widget for a user if they don't have one.
 * 
 * @param userId - The ID of the user.
 * @param currentWidgets - The current list of widgets.
 * @returns Array of widgets including the created one.
 */
export async function ensureUserWidgets(userId: string, currentWidgets: any[]): Promise<any[]> {
  if (currentWidgets && currentWidgets.length > 0) {
    return currentWidgets;
  }

  const timestamp = Date.now();
  const widgetToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;

  const createdWidget = await prisma.client.widget.create({
    data: {
      userId,
      type: "ALERTBOX",
      token: widgetToken,
      alertbox: {
        create: {
          events: {
            createMany: {
              data: DEFAULT_ALERTBOX_EVENTS,
            },
          },
        },
      },
    },
    include: {
      alertbox: {
        include: {
          events: true,
        },
      },
    },
  });

  return [createdWidget];
}
