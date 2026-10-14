import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { Prisma } from "@/generated/prisma/client";
import { basicUserSelect, fullUserSelect } from "@/consts/session";
import { day } from "@/consts/time";
import { MeOptions, SessionMetadata } from "@/types/me.types";
import { createSession, destroySession, trackSessionUsage } from "./session";
import { createAccount, isExist, deleteAccount, ensureUserWidgets } from "./account";
import { getCachedUser, setCachedUser, filterUserSelection } from "./cache";
import { listUserDevices, destroyUserDevice } from "./device";
import { supported_providers } from "@/consts/providers";
import { OrgPerm } from "@/utils/rbac";
import { DEFAULT_ALERTBOX_EVENTS } from "@/consts/widget";
import { nanoid } from "nanoid";

export class Me<T extends Prisma.UserSelect = typeof basicUserSelect> {
  public data: (Prisma.UserGetPayload<{ select: T }> & { id: bigint }) | null =
    null;
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

    // Fetch session and include user via minimal select to drop unneeded heavy columns
    const session_info = await prisma.client.session.findUnique({
      where: {
        token: session,
      },
      select: {
        id: true,
        userId: true,
        ipAddress: true,
        disabledAt: true,
        expiresAt: true,
        user: { select: { id: true } },
      },
    });

    if (
      !session_info ||
      session_info.disabledAt ||
      session_info.expiresAt <= new Date() ||
      !session_info.user
    ) {
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
      const anyCached = cached as any;
      if (anyCached && Array.isArray(anyCached.memberships)) {
        this.data = filterUserSelection(cached, select) as any;
        return this;
      }
    }

    // Re-fetch with full user selection if not cached
    const user = await prisma.client.user.findUnique({
      where: {
        id: session_info.userId,
      },
      select: fullUserSelect,
    });

    if (!user) return null;

    if (user.deletedAt) {
      await redis.redis.setex("user:" + session_info.userId + ":info", day, "deleted");
      return false;
    }

    // Run dynamic self-healing/migration checks on loaded user data
    const healedUser = await this.selfHeal(user);

    const cacheableUser = await setCachedUser(session_info.userId, healedUser);
    this.data = filterUserSelection(cacheableUser, select) as any;
    return this;
  }

  /**
   * Load user data by UID.
   */
  public async load<S extends Prisma.UserSelect>(
    uid: string | bigint,
    select: S,
  ): Promise<Me<S> | false | null>;
  public async load(uid: string | bigint): Promise<Me<T> | false | null>;
  public async load(uid: string | bigint, select: any = basicUserSelect): Promise<any> {
    this.lastSelect = select;
    if (this.options.cache) {
      const cached = await getCachedUser(uid);
      if (cached === "deleted") return false;
      const anyCached = cached as any;
      if (anyCached && Array.isArray(anyCached.memberships)) {
        this.data = filterUserSelection(cached, select) as any;
        return this;
      }
    }

    let bigUid: bigint;
    try {
      bigUid = BigInt(uid);
    } catch {
      return null;
    }

    const user = await prisma.client.user.findUnique({
      where: {
        id: bigUid,
      },
      select: fullUserSelect,
    });

    if (!user) return null;

    if (user.deletedAt) {
      await redis.redis.setex("user:" + uid + ":info", day, "deleted");
      return false;
    }

    // Run dynamic self-healing/migration checks on loaded user data
    const healedUser = await this.selfHeal(user);

    const cacheableUser = await setCachedUser(uid, healedUser);
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
    await prisma.client.$transaction([
      prisma.client.user.update({
        data: { secret: newSecret },
        where: { id: BigInt(this.data.id) },
      }),
      prisma.client.session.updateMany({
        where: { userId: BigInt(this.data.id), disabledAt: null },
        data: { disabledAt: new Date() },
      }),
    ]);
    return true;
  }

  /**
   * Return the loaded data with fallback profile and widgets for backward compatibility.
   */
  public toJSON() {
    const rawData = this.data as any;
    if (!rawData) return rawData;

    let primaryStreamer: any = null;
    if (rawData.memberships && rawData.memberships.length > 0) {
      for (const m of rawData.memberships) {
        if (m.organization?.streamers && m.organization.streamers.length > 0) {
          primaryStreamer = m.organization.streamers[0];
          break;
        }
      }
    }

    return {
      ...rawData,
      profile: rawData.profile || primaryStreamer || null,
      widgets: rawData.widgets || primaryStreamer?.widgets || [],
    };
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
   * Run dynamic checks on loaded user data.
   */
  private async selfHeal(user: any): Promise<any> {
    return user;
  }
}
