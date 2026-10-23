import { db } from "@/db";
import { sql } from "kysely";
import { redis } from "@/core/redis";
import { basicUserSelect, pureUserSelect } from "@/consts/session";
import { day } from "@/consts/time";
import { MeOptions, SessionMetadata } from "@/types/me.types";
import { createSession, destroySession, trackSessionUsage } from "./session";
import { createAccount, isExist, deleteAccount, ensureUserWidgets } from "./account";
import { getCachedUser, setCachedUser, filterUserSelection } from "./cache";
import { listUserDevices, destroyUserDevice } from "./device";
import { supported_providers } from "@/consts/providers";
import { hasPermission, parseStreamerPermissions } from "@/utils/rbac";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { nanoid } from "nanoid";

export class Me<T = any> {
  public data: any = null;
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
    const rawMembers = await db
      .selectFrom("OrganizationMember")
      .innerJoin("Organization", "Organization.id", "OrganizationMember.orgId")
      .where("OrganizationMember.userId", "=", Number(userId))
      .where("OrganizationMember.isDeleted", "is", null)
      .where("Organization.deletedAt", "is", null)
      .select([
        "OrganizationMember.id as memberId",
        "OrganizationMember.orgId as memberOrgId",
        "OrganizationMember.userId",
        "OrganizationMember.role",
        "OrganizationMember.permissions",
        "OrganizationMember.createdAt as memberCreatedAt",
        "Organization.id as orgId",
        "Organization.type as orgType",
        "Organization.name as orgName",
        "Organization.slug as orgSlug",
        "Organization.avatar as orgAvatar",
        "Organization.banner as orgBanner",
        "Organization.ownerId as orgOwnerId",
        "Organization.createdAt as orgCreatedAt",
      ])
      .orderBy("OrganizationMember.createdAt", "asc")
      .execute();

    if (rawMembers.length === 0) return [];

    const orgIds = Array.from(new Set(rawMembers.map((m) => m.orgId)));

    const streamers = await db
      .selectFrom("Streamer")
      .where("orgId", "in", orgIds)
      .where("deletedAt", "is", null)
      .selectAll()
      .orderBy("createdAt", "asc")
      .execute();

    const streamerIds = streamers.map((s) => s.id);

    const widgets = streamerIds.length > 0
      ? await db
          .selectFrom("Widget")
          .where("streamerId", "in", streamerIds)
          .where("deletedAt", "is", null)
          .select([
            "id",
            "streamerId",
            "type",
            "token",
            "createdAt",
            "updatedAt",
          ])
          .execute()
      : [];

    const integrations = streamerIds.length > 0
      ? await db
          .selectFrom("Integration")
          .where("streamerId", "in", streamerIds)
          .where("deletedAt", "is", null)
          .select([
            "id",
            "orgId",
            "streamerId",
            "stripeSecret",
            "bmacSecret",
            "kofiSecret",
            "xenditSecret",
            "ffpSecret",
            "streamlabsSecret",
            "kofiUsername",
            "bmacUsername",
          ])
          .execute()
      : [];

    const widgetMap = new Map<string, any[]>();
    for (const w of widgets) {
      const key = String(w.streamerId);
      const list = widgetMap.get(key) || [];
      list.push(w);
      widgetMap.set(key, list);
    }

    const integrationMap = new Map<string, any>();
    for (const i of integrations) {
      integrationMap.set(String(i.streamerId), i);
    }

    const streamerOrgMap = new Map<string, any[]>();
    for (const s of streamers) {
      const key = String(s.orgId);
      const list = streamerOrgMap.get(key) || [];
      list.push({
        ...s,
        widgets: widgetMap.get(String(s.id)) || [],
        integration: integrationMap.get(String(s.id)) || null,
      });
      streamerOrgMap.set(key, list);
    }

    const rawMemberships = rawMembers.map((m) => ({
      id: String(m.memberId),
      orgId: String(m.orgId),
      userId: String(m.userId),
      role: m.role,
      permissions: m.permissions,
      createdAt: m.memberCreatedAt,
      organization: {
        id: String(m.orgId),
        type: m.orgType,
        name: m.orgName,
        slug: m.orgSlug,
        avatar: m.orgAvatar,
        banner: m.orgBanner,
        ownerId: String(m.orgOwnerId),
        createdAt: m.orgCreatedAt,
        streamers: streamerOrgMap.get(String(m.orgId)) || [],
      },
    }));

    const memberAssignmentKeys = rawMemberships.map((m) => `org:${String(m.orgId)}:member:${String(m.id)}:streamers`);
    const cachedMemberAssignments = memberAssignmentKeys.length > 0 ? await redis.redis.mget(memberAssignmentKeys) : [];

    const memberships = rawMemberships.map((m, idx) => {
      const isOwnerOrAdmin = m.role === "OWNER" || m.role === "ADMIN";
      let permBig = 0n;
      try {
        permBig = typeof m.permissions === "bigint" ? m.permissions : BigInt(m.permissions ?? 0);
      } catch {
        permBig = 0n;
      }
      const hasOrgViewStreamers = isOwnerOrAdmin || hasPermission(permBig, OrgPerm.STREAMER_VIEW);
      const hasOrgEditProfile = isOwnerOrAdmin || hasPermission(permBig, OrgPerm.STREAMER_MANAGE);
      const hasOrgViewTransactions = isOwnerOrAdmin || hasPermission(permBig, OrgPerm.TRANSACTION_VIEW);
      const hasOrgViewAnalytics = isOwnerOrAdmin || hasPermission(permBig, OrgPerm.ANALYTICS_VIEW);
      const hasOrgManageWidgets =
        isOwnerOrAdmin ||
        hasPermission(permBig, OrgPerm.WIDGET_MANAGE) ||
        hasPermission(permBig, OrgPerm.WIDGET_VIEW);
      const hasOrgManageIntegrations =
        isOwnerOrAdmin ||
        hasPermission(permBig, OrgPerm.INTEGRATION_MANAGE) ||
        hasPermission(permBig, OrgPerm.INTEGRATION_VIEW);

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

      const allOrgStreamers = (m.organization?.streamers || []).map((s: any) => {
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
            if (streamerList.length > 0) {
              const map: Record<string, string> = {};
              for (const s of streamerList) {
                map[s.id] = JSON.stringify(s);
              }
              pipeline.hset(`org:${String(org.id)}:streamers`, map);
              pipeline.expire(`org:${String(org.id)}:streamers`, 3600);
            }
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
  public async use(session: string, ip: string, select: any = basicUserSelect): Promise<any> {
    this.currentSession = session;
    this.lastSelect = select;

    const session_info = await db
      .selectFrom("Session")
      .innerJoin("User", "User.id", "Session.userId")
      .where("Session.token", "=", session)
      .select([
        "Session.id as sessionId",
        "Session.userId",
        "Session.ipAddress",
        "Session.disabledAt",
        "Session.expiresAt",
        "User.id as validUserId",
        sql<number>`Session.expiresAt <= NOW()`.as("isExpired"),
      ])
      .executeTakeFirst();

    if (
      !session_info ||
      session_info.disabledAt ||
      Boolean(session_info.isExpired) ||
      !session_info.validUserId
    ) {
      if (session_info) void destroySession(session);
      return false;
    }

    // Track session usage in background
    void trackSessionUsage(session_info.userId, session_info.sessionId, ip);

    const isLoopback = (addr: string) =>
      addr === "127.0.0.1" ||
      addr === "::1" ||
      addr === "::ffff:127.0.0.1" ||
      addr === "localhost";

    const isIpMatch =
      session_info.ipAddress === ip ||
      (isLoopback(session_info.ipAddress) && isLoopback(ip));

    if (!isIpMatch) {
      void destroySession(session);
      return false;
    }

    return this.load(session_info.userId, select);
  }

  /**
   * Load user data by UID.
   */
  public async load(uid: string | bigint | number, select: any = basicUserSelect): Promise<any> {
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
      pureUser = await db
        .selectFrom("User")
        .where("id", "=", Number(bigUid))
        .select([
          "id",
          "type",
          "email",
          "name",
          "displayName",
          "avatar",
          "createWith",
          "createdAt",
          "disabledAt",
          "deletedAt",
        ])
        .executeTakeFirst();

      if (!pureUser) return null;

      if (pureUser.deletedAt) {
        await redis.redis.setex("user:" + uid + ":info", day, "deleted");
        return false;
      }

      await setCachedUser(bigUid, pureUser);
    }

    if (!needsMemberships) {
      this.data = filterUserSelection(pureUser, select);
      return this;
    }

    const memberships = await this.fetchUserMemberships(bigUid);
    this.data = filterUserSelection({ ...pureUser, memberships }, select);
    return this;
  }

  /**
   * Create a new account.
   */
  public async create(
    data: { name: string; displayName?: string; email: string; createWith: string },
    select: any = basicUserSelect,
  ): Promise<any> {
    this.lastSelect = select;
    const user = await createAccount(data);
    if (!user) return false;

    await setCachedUser(user.id, user);

    if (select && ("memberships" in select)) {
      return this.load(user.id, select);
    }

    this.data = filterUserSelection(user, select);
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
      await Promise.all(
        supported_providers.map((provider) =>
          redis.redis.del(`user:${this.data!.id}:connections:${provider}`),
        ),
      );
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
    await db.transaction().execute(async (trx) => {
      await trx
        .updateTable("User")
        .set({ secret: newSecret })
        .where("id", "=", Number(this.data.id))
        .execute();

      await trx
        .updateTable("Session")
        .set({ disabledAt: new Date() })
        .where("userId", "=", Number(this.data.id))
        .where("disabledAt", "is", null)
        .execute();
    });
    return true;
  }

  /**
   * Return the pure authenticated user data.
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
}
