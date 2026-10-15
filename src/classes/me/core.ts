import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { Prisma } from "@/generated/prisma/client";
import { basicUserSelect, pureUserSelect } from "@/consts/session";
import { day } from "@/consts/time";
import { MeOptions, SessionMetadata } from "@/types/me.types";
import { createSession, destroySession, trackSessionUsage } from "./session";
import { createAccount, isExist, deleteAccount, ensureUserWidgets } from "./account";
import { getCachedUser, setCachedUser, filterUserSelection } from "./cache";
import { listUserDevices, destroyUserDevice } from "./device";
import { supported_providers } from "@/consts/providers";
import { OrgPerm, hasPermission, StreamerPerm, parseStreamerPermissions } from "@/utils/rbac";
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
   * Helper to fetch active memberships, organizations, and streamers.
   */
  private async fetchUserMemberships(userId: bigint): Promise<any[]> {
    const rawMemberships = await prisma.client.organizationMember.findMany({
      where: {
        userId,
        organization: { deletedAt: null },
      },
      include: {
        organization: {
          include: {
            streamers: {
              where: { deletedAt: null },
              include: {
                widgets: {
                  where: { deletedAt: null },
                  select: {
                    id: true,
                    streamerId: true,
                    type: true,
                    token: true,
                    createdAt: true,
                    updatedAt: true,
                  },
                },
                integration: {
                  select: {
                    id: true,
                    orgId: true,
                    streamerId: true,
                    stripeSecret: true,
                    bmacSecret: true,
                    kofiSecret: true,
                    xenditSecret: true,
                    ffpSecret: true,
                    streamlabsSecret: true,
                    kofiUsername: true,
                    bmacUsername: true,
                  },
                },
              },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const memberAssignmentKeys = rawMemberships.map((m) => `org:${String(m.orgId)}:member:${String(m.id)}:streamers`);
    const cachedMemberAssignments = memberAssignmentKeys.length > 0 ? await redis.redis.mget(memberAssignmentKeys) : [];

    const memberships = rawMemberships.map((m, idx) => {
      const isOwnerOrAdmin = m.role === "OWNER" || m.role === "ADMIN";
      const hasOrgViewStreamers = isOwnerOrAdmin || hasPermission(m.permissions, OrgPerm.STREAMER_VIEW);
      const hasOrgEditProfile = isOwnerOrAdmin || hasPermission(m.permissions, OrgPerm.STREAMER_MANAGE);
      const hasOrgViewTransactions = isOwnerOrAdmin || hasPermission(m.permissions, OrgPerm.TRANSACTION_VIEW);
      const hasOrgViewAnalytics = isOwnerOrAdmin || hasPermission(m.permissions, OrgPerm.ANALYTICS_VIEW);
      const hasOrgManageWidgets =
        isOwnerOrAdmin ||
        hasPermission(m.permissions, OrgPerm.WIDGET_MANAGE) ||
        hasPermission(m.permissions, OrgPerm.WIDGET_VIEW);
      const hasOrgManageIntegrations =
        isOwnerOrAdmin ||
        hasPermission(m.permissions, OrgPerm.INTEGRATION_MANAGE) ||
        hasPermission(m.permissions, OrgPerm.INTEGRATION_VIEW);

      let assignmentsMap = new Map<string, number>();
      let assignedStreamerIds: string[] = [];
      if (!isOwnerOrAdmin && cachedMemberAssignments[idx]) {
        try {
          const parsed = JSON.parse(cachedMemberAssignments[idx]!);
          for (const a of parsed) {
            assignmentsMap.set(String(a.streamerId), parseStreamerPermissions(a.permissions));
          }
          assignedStreamerIds = parsed.map((a: any) => String(a.streamerId));
        } catch {}
      }

      const allOrgStreamers = (m.organization?.streamers || []).map((s) => {
        const { integration, ...streamerRest } = s as any;
        const sId = String(s.id);
        const assignedBits = assignmentsMap.get(sId) || 0;

        let perms = 0;
        if (isOwnerOrAdmin) {
          perms = StreamerPerm.ALL;
        } else {
          perms = assignedBits;
          if (hasOrgViewStreamers) perms |= StreamerPerm.STREAMER_VIEW;
          if (hasOrgEditProfile) perms |= StreamerPerm.STREAMER_MANAGE;
          if (hasOrgViewTransactions) perms |= StreamerPerm.STREAMER_TRANSACTION_VIEW;
          if (hasOrgViewAnalytics) perms |= StreamerPerm.STREAMER_ANALYTICS_VIEW;
          if (hasOrgManageWidgets) perms |= StreamerPerm.STREAMER_WIDGET_MANAGE;
          if (hasOrgManageIntegrations) perms |= StreamerPerm.STREAMER_INTEGRATION_MANAGE;
        }

        return {
          ...streamerRest,
          permissions: perms,
          isAssigned: isOwnerOrAdmin || assignmentsMap.has(sId),
          integration: integration
            ? {
                id: String(integration.id),
                orgId: String(integration.orgId),
                streamerId: String(integration.streamerId),
                stripe: Boolean(integration.stripeSecret),
                bmac: Boolean(integration.bmacSecret),
                kofi: Boolean(integration.kofiSecret),
                xendit: Boolean(integration.xenditSecret),
                ffp: Boolean(integration.ffpSecret),
                streamlabs: Boolean(integration.streamlabsSecret),
                kofiUsername: integration.kofiUsername,
                bmacUsername: integration.bmacUsername,
              }
            : null,
        };
      });

      const visibleStreamers = hasOrgViewStreamers
        ? allOrgStreamers
        : allOrgStreamers.filter((s: any) => assignedStreamerIds.includes(String(s.id)));

      return {
        ...m,
        organization: m.organization
          ? {
              ...m.organization,
              streamers: visibleStreamers,
            }
          : m.organization,
      };
    });

    if (this.options.cache && memberships.length > 0) {
      const userKey = String(userId);
      const pipeline = redis.redis.pipeline();

      for (const m of memberships) {
        pipeline.hset(
          `user:${userKey}:orgs`,
          String(m.orgId),
          `${m.role}:${m.permissions.toString()}`,
        );

        const org = m.organization;
        if (org) {
          const orgInfo = {
            id: String(org.id),
            name: org.name,
            slug: org.slug,
            avatar: org.avatar,
            banner: org.banner,
            ownerId: String(org.ownerId),
            createdAt: org.createdAt,
          };
          pipeline.setex(`org:${String(org.id)}:info`, day, JSON.stringify(orgInfo));

          if (org.streamers && org.streamers.length > 0) {
            const streamerList = org.streamers.map((s: any) => ({
              id: String(s.id),
              name: s.name,
              displayName: s.displayName,
              avatar: s.avatar,
              uri: s.uri,
              publishedAt: s.publishedAt,
              widgets: (s.widgets || []).map((w: any) => ({
                ...w,
                id: String(w.id),
              })),
              integration: s.integration,
              createdAt: s.createdAt,
            }));
            pipeline.setex(`org:${String(org.id)}:streamers`, 3600, JSON.stringify(streamerList));
          }
        }
      }

      pipeline.expire(`user:${userKey}:orgs`, day);
      void pipeline.exec().catch(() => {});
    }

    return memberships;
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

    return this.load(session_info.userId, select);
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

    let bigUid: bigint;
    try {
      bigUid = BigInt(uid);
    } catch {
      return null;
    }

    const needsMemberships = Boolean(select && ("memberships" in select));

    let pureUser: any = null;
    if (this.options.cache) {
      pureUser = await getCachedUser(bigUid);
      if (pureUser === "deleted") return false;
    }

    if (!pureUser || pureUser.id == null) {
      pureUser = await prisma.client.user.findUnique({
        where: { id: bigUid },
        select: pureUserSelect,
      });

      if (!pureUser) return null;

      if (pureUser.deletedAt) {
        await redis.redis.setex("user:" + uid + ":info", day, "deleted");
        return false;
      }

      await setCachedUser(bigUid, pureUser);
    }

    if (!needsMemberships) {
      this.data = filterUserSelection(pureUser, select) as any;
      return this;
    }

    const memberships = await this.fetchUserMemberships(bigUid);
    this.data = filterUserSelection({ ...pureUser, memberships }, select) as any;
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

    await setCachedUser(user.id, user);

    if (select && ("memberships" in select)) {
      return this.load(user.id, select);
    }

    this.data = filterUserSelection(user, select) as any;
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
