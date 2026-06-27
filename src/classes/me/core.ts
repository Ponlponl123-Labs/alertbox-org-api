import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { Prisma } from "@/generated/prisma/client";
import { basicUserSelect, fullUserSelect } from "@/consts/session";
import { day } from "@/consts/time";
import { MeOptions, SessionMetadata } from "@/types/me.types";
import { createSession, destroySession, trackSessionUsage } from "./session";
import { createAccount, isExist, deleteAccount } from "./account";
import { getCachedUser, setCachedUser, filterUserSelection } from "./cache";
import { registerURI, getURIOwner, updateProfile } from "./profile";
import {
  SupportedProvider,
  setConnection,
  removeConnection,
  supported_providers,
} from "./connections";
import { listUserDevices, destroyUserDevice } from "./device";

export class Me<T extends Prisma.UserSelect = typeof basicUserSelect> {
  public data:
    | (Prisma.UserGetPayload<{ select: T }> & { id: string })
    | null = null;
  private options: MeOptions;
  private currentSession: string | null = null;
  private lastSelect: any = basicUserSelect;

  constructor(options: MeOptions = { cache: true }) {
    this.options = options;
  }

  /**
   * Authenticate and load user data using a session token.
   */
  public async use<S extends Prisma.UserSelect>(
    session: string,
    ip: string,
    select: S,
  ): Promise<Me<S> | false | null>;
  public async use(session: string, ip: string): Promise<Me<T> | false | null>;
  public async use(
    session: string,
    ip: string,
    select: any = basicUserSelect,
  ): Promise<any> {
    this.currentSession = session;
    this.lastSelect = select;

    // Fetch session and include user to verify secret matching automatically
    const session_info = await prisma.client.session.findFirst({
      where: {
        token: session,
        disabledAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      include: {
        user: true, // This will only resolve if userSecret matches user.secret due to schema relation
      }
    });

    if (!session_info || !session_info.user) {
      // If session exists but user is null, it means User.secret has changed
      if (session_info) void destroySession(session);
      return false;
    }

    // Track session usage in background
    void trackSessionUsage(session_info.userId, session_info.id, ip);

    if (session_info.ipAddress !== ip) {
      void destroySession(session);
      return false;
    }

    if (this.options.cache) {
      const cached = await getCachedUser(session_info.userId);
      if (cached === "deleted") return false;
      if (cached) {
        this.data = filterUserSelection(cached, select) as any;
        return this;
      }
    }

    // Re-fetch with full user selection if not cached
    const user = await prisma.client.user.findFirst({
      where: {
        id: session_info.userId,
      },
      select: {
        ...fullUserSelect,
      } as any
    });

    if (!user) return null;

    if (user.deletedAt) {
      await redis.redis.setex("user:" + session_info.userId + ":info", day, "deleted");
      return false;
    }

    const cacheableUser = await setCachedUser(session_info.userId, user);
    this.data = filterUserSelection(cacheableUser, select) as any;
    return this;
  }

  /**
   * Load user data by UID.
   */
  public async load<S extends Prisma.UserSelect>(
    uid: string,
    select: S,
  ): Promise<Me<S> | false | null>;
  public async load(uid: string): Promise<Me<T> | false | null>;
  public async load(uid: string, select: any = basicUserSelect): Promise<any> {
    this.lastSelect = select;
    if (this.options.cache) {
      const cached = await getCachedUser(uid);
      if (cached === "deleted") return false;
      if (cached) {
        this.data = filterUserSelection(cached, select) as any;
        return this;
      }
    }

    const user = await prisma.client.user.findFirst({
      where: {
        id: uid,
      },
      select: {
        ...fullUserSelect,
      } as any
    });

    if (!user) return null;

    if (user.deletedAt) {
      await redis.redis.setex("user:" + uid + ":info", day, "deleted");
      return false;
    }

    const cacheableUser = await setCachedUser(uid, user);
    this.data = filterUserSelection(cacheableUser, select) as any;
    return this;
  }

  /**
   * Create a new account.
   */
  public async create<S extends Prisma.UserSelect>(
    data: { name: string; email: string; createWith: string },
    select: S,
  ): Promise<Me<S> | false>;
  public async create(data: {
    name: string;
    email: string;
    createWith: string;
  }): Promise<Me<T> | false>;
  public async create(
    data: { name: string; email: string; createWith: string },
    select: any = basicUserSelect,
  ): Promise<any> {
    this.lastSelect = select;
    const user = await createAccount(data);
    if (!user) return false;

    const cacheableUser = await setCachedUser(user.id, user);
    this.data = filterUserSelection(cacheableUser, select) as any;
    return this;
  }

  /**
   * Session management namespace.
   */
  public get session() {
    return {
      create: async (metadata: SessionMetadata) => {
        if (!this.data) {
          throw new Error(
            "User data not loaded. Use .use(), .load(), or .create() first.",
          );
        }
        return createSession(this.data.id, metadata);
      },
      destroy: async () => {
        if (!this.currentSession) return false;
        return destroySession(this.currentSession);
      },
    };
  }

  /**
   * Profile and URI management namespace.
   */
  public get profile() {
    return {
      registerURI: async (uri: string) => {
        if (!this.data) {
          throw new Error(
            "User data not loaded. Use .use(), .load(), or .create() first.",
          );
        }
        if (!this.currentSession) {
          throw new Error(
            "Current session token unknown. Use .use() to authenticate.",
          );
        }
        return registerURI(this.data.id, uri, this.currentSession);
      },
      update: async (payload: {
        displayname?: string;
        bio?: string | null;
        accentColor?: string | null;
        socialDiscord?: string | null;
        socialFacebook?: string | null;
        socialReddit?: string | null;
        socialTwitch?: string | null;
        socialTwitter?: string | null;
        socialYoutube?: string | null;
        avatar?: File;
        banner?: File;
      }) => {
        if (!this.data) {
          throw new Error(
            "User data not loaded. Use .use(), .load(), or .create() first.",
          );
        }
        const updated = await updateProfile(
          this.data.id,
          this.data as any,
          payload,
        );
        if (updated) {
          // Re-load with exactly T to maintain internal type consistency
          const reloaded = await this.load<T>(this.data.id, this.lastSelect as T);
          if (reloaded && reloaded.data) {
            this.data = reloaded.data as any;
          }
        }
        return updated;
      },
    };
  }

  /**
   * Connections management namespace.
   */
  public get connections() {
    return {
      set: async (
        provider: SupportedProvider,
        secret: string | { username: string; secret: string },
      ) => {
        if (!this.data) {
          throw new Error(
            "User data not loaded. Use .use(), .load(), or .create() first.",
          );
        }
        return setConnection(this.data.id, provider, secret);
      },
      remove: async (provider: SupportedProvider) => {
        if (!this.data) {
          throw new Error(
            "User data not loaded. Use .use(), .load(), or .create() first.",
          );
        }
        return removeConnection(this.data.id, provider);
      },
    };
  }

  /**
   * Active devices management namespace.
   */
  public get devices() {
    return {
      list: async () => {
        if (!this.data) {
          throw new Error(
            "User data not loaded. Use .use(), .load(), or .create() first.",
          );
        }
        if (!this.currentSession) {
          throw new Error(
            "Current session token unknown. Use .use() to authenticate.",
          );
        }
        return listUserDevices(this.data.id, this.currentSession);
      },
      destroy: async (deviceId: string) => {
        if (!this.data) {
          throw new Error(
            "User data not loaded. Use .use(), .load(), or .create() first.",
          );
        }
        return destroyUserDevice(this.data.id, deviceId);
      },
    };
  }

  /**
   * Delete the current account.
   */
  public async delete() {
    if (!this.data) {
      throw new Error("User data not loaded. Load full data first.");
    }
    const result = await deleteAccount(this.data.id, (this.data as any).email);

    if (result) {
      await Promise.all(supported_providers.map(provider => 
        redis.redis.del(`user:${this.data!.id}:connections:${provider}`)
      ));
    }

    return result;
  }

  /**
   * Invalidate all sessions by changing the user secret.
   */
  public async invalidateAllSessions() {
    if (!this.data) {
      throw new Error("User data not loaded.");
    }
    const newSecret = `${nanoid(32)}.${Date.now()}.${nanoid(32)}`;
    await prisma.client.user.update({
      data: { secret: newSecret },
      where: { id: this.data.id }
    });
    // Since Sessions reference the secret, they are now effectively invalid for relations.
    // They will also be cleaned up or marked as disabled if we want more explicit handling.
    return true;
  }

  /**
   * Return the loaded data.
   */
  public toJSON() {
    return this.data;
  }

  /**
   * Check if a user exists by email.
   */
  public static async isExist(email: string) {
    return isExist(email);
  }

  /**
   * Standalone static methods for session management.
   */
  public static async createSession(uid: string, metadata: SessionMetadata) {
    return createSession(uid, metadata);
  }

  public static async destroySession(token: string) {
    return destroySession(token);
  }

  /**
   * Find owner of a URI.
   */
  public static async getURIOwner(uri: string) {
    return getURIOwner(uri);
  }
}

import { nanoid } from "nanoid";
