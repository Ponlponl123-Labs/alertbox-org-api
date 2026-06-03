import { prisma, redis } from "@/index";
import { Prisma } from "@/generated/prisma/client";
import { basicUserSelect } from "@/consts/session";
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

export class Me<T extends Prisma.accountsSelect = typeof basicUserSelect> {
  public data:
    | (Prisma.accountsGetPayload<{ select: T }> & { id: bigint })
    | null = null;
  private options: MeOptions;
  private currentSession: string | null = null;
  private lastSelect: Prisma.accountsSelect = basicUserSelect;

  constructor(options: MeOptions = { cache: true }) {
    this.options = options;
  }

  /**
   * Authenticate and load user data using a session token.
   */
  public async use<S extends Prisma.accountsSelect>(
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
    const session_info = await prisma.client.sessions.findFirst({
      where: {
        token: session,
        disabled: null,
        expire: {
          gt: new Date(),
        },
      },
    });

    if (!session_info) return false;

    // Track session usage in background
    void trackSessionUsage(session_info.uid, session_info.secret, session, ip);

    if (session_info.ip_addr !== ip) {
      void destroySession(session);
      return false;
    }

    if (this.options.cache) {
      const cached = await getCachedUser(session_info.uid, select);
      if (cached === "deleted") return false;
      if (cached) {
        this.data = filterUserSelection(cached, select);
        return this;
      }
    }

    const user = await prisma.client.accounts.findFirst({
      where: {
        id: session_info.uid,
      },
    });

    if (!user) return null;

    if (user.deleted) {
      redis.redis.setex("user:" + session_info.uid + ":info", day, "deleted");
      return false;
    }

    const cacheableUser = await setCachedUser(session_info.uid, user);
    this.data = filterUserSelection(cacheableUser, select);
    return this;
  }

  /**
   * Load user data by UID.
   */
  public async load<S extends Prisma.accountsSelect>(
    uid: bigint,
    select: S,
  ): Promise<Me<S> | false | null>;
  public async load(uid: bigint): Promise<Me<T> | false | null>;
  public async load(uid: bigint, select: any = basicUserSelect): Promise<any> {
    this.lastSelect = select;
    if (this.options.cache) {
      const cached = await getCachedUser(uid, select);
      if (cached === "deleted") return false;
      if (cached) {
        this.data = filterUserSelection(cached, select);
        return this;
      }
    }

    const user = await prisma.client.accounts.findFirst({
      where: {
        id: uid,
      },
    });

    if (!user) return null;

    if (user.deleted) {
      redis.redis.setex("user:" + uid + ":info", day, "deleted");
      return false;
    }

    const cacheableUser = await setCachedUser(uid, user);
    this.data = filterUserSelection(cacheableUser, select);
    return this;
  }

  /**
   * Create a new account.
   */
  public async create<S extends Prisma.accountsSelect>(
    data: { name: string; email: string; create_with: string },
    select: S,
  ): Promise<Me<S> | false>;
  public async create(data: {
    name: string;
    email: string;
    create_with: string;
  }): Promise<Me<T> | false>;
  public async create(
    data: { name: string; email: string; create_with: string },
    select: any = basicUserSelect,
  ): Promise<any> {
    this.lastSelect = select;
    const user = await createAccount(data);
    if (!user) return false;

    const cacheableUser = await setCachedUser(user.id, user);
    this.data = filterUserSelection(cacheableUser, select);
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
        social_discord?: string | null;
        social_facebook?: string | null;
        social_reddit?: string | null;
        social_twitchtv?: string | null;
        social_twitter?: string | null;
        social_youtube?: string | null;
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
          this.data = filterUserSelection(updated, this.lastSelect);
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
      set: async (provider: SupportedProvider, secret: string) => {
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
      destroy: async (deviceId: bigint) => {
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
    // Attempt to get email from current data, if not present we might need to reload or just use ID
    // Soft-delete handled by helper
    const result = await deleteAccount(this.data.id, (this.data as any).email);

    // Cleanup specific connection caches
    if (result) {
      supported_providers.forEach(async (provider) => {
        await redis.redis.del(`user:${this.data!.id}:connections:${provider}`);
      });
    }

    return result;
  }

  /**
   * Return the loaded data.
   */
  public toJSON() {
    return this.data;
  }

  /**
   * Check if an account exists by email.
   */
  public static async isExist(email: string) {
    return isExist(email);
  }

  /**
   * Standalone static methods for session management.
   */
  public static async createSession(uid: bigint, metadata: SessionMetadata) {
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
