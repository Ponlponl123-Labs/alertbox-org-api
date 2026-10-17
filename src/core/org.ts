import Elysia from "elysia";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { redis } from "./redis";
import {
  hasPermission,
  OrgPerm,
  StreamerPerm,
  parseStreamerPermissions,
  hasStreamerPermission,
} from "@/utils/rbac";
import { OrgRole } from "@/generated/prisma/client";

export interface OrgContext {
  orgId: bigint;
  streamerId: bigint;
  role: OrgRole;
  permissions: bigint;
}

export async function resolveOrgId(param?: string | null): Promise<bigint | null> {
  if (!param) return null;
  const trimmed = param.trim();
  if (/^\d+$/.test(trimmed)) {
    try {
      const cached = await redis.redis.get(`org:${trimmed}:info`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed?.id) return BigInt(parsed.id);
      }
      const numericId = BigInt(trimmed);
      const exists = await prisma.client.organization.findFirst({
        where: { id: numericId, deletedAt: null },
        select: { id: true },
      });
      if (exists) return exists.id;
    } catch {}
  }
  const org = await prisma.client.organization.findFirst({
    where: {
      OR: [
        { slug: trimmed.toLowerCase() },
        { name: trimmed },
      ],
      deletedAt: null,
    },
    select: { id: true },
  });
  return org ? org.id : null;
}

export async function resolveStreamerId(
  orgId: bigint,
  streamerParam?: string | null,
): Promise<bigint | null> {
  if (!streamerParam) return null;
  const trimmed = streamerParam.trim();
  if (/^\d+$/.test(trimmed)) {
    try {
      const numericId = BigInt(trimmed);
      const exists = await prisma.client.streamer.findFirst({
        where: { id: numericId, orgId, deletedAt: null },
        select: { id: true },
      });
      if (exists) return exists.id;
    } catch {}
  }
  const streamer = await prisma.client.streamer.findFirst({
    where: {
      orgId,
      OR: [
        { name: trimmed },
        { uri: trimmed },
        { displayName: trimmed },
      ],
      deletedAt: null,
    },
    select: { id: true },
  });
  return streamer ? streamer.id : null;
}

/**
 * Elysia plugin that resolves the active Organization and Streamer context
 * for the authenticated user, enforcing membership and caching permissions in Redis.
 */
export const orgContext = new Elysia({ name: "org-context" })
  .use(auth)
  .derive({ as: "scoped" }, async ({ headers, cookie, getAuthenticatedUser, set }): Promise<{ org: OrgContext | null }> => {
    const user = await getAuthenticatedUser();
    if (!user || !user.data) {
      return { org: null };
    }

    const userId = user.data.id;
    const userKey = String(userId);

    const requestedOrgIdHeader = headers["x-org-id"] || (cookie?.ab_org_id?.value as string | undefined);
    let targetOrgId: bigint | null = null;

    if (requestedOrgIdHeader) {
      targetOrgId = await resolveOrgId(requestedOrgIdHeader);
    }

    let membership: { role: OrgRole; permissions: bigint; orgId: bigint } | null = null;

    if (targetOrgId) {
      const cached = await redis.redis.hget(`user:${userKey}:orgs`, String(targetOrgId));
      if (cached) {
        try {
          const [roleStr, permStr] = cached.split(":");
          membership = {
            orgId: targetOrgId,
            role: roleStr as OrgRole,
            permissions: BigInt(permStr),
          };
        } catch {
        }
      }
    }

    if (!membership) {
      const memberRecord = await prisma.client.organizationMember.findFirst({
        where: targetOrgId ? { userId, orgId: targetOrgId, isDeleted: null } : { userId, isDeleted: null },
        select: {
          orgId: true,
          role: true,
          permissions: true,
        },
        orderBy: { createdAt: "asc" },
      });

      if (memberRecord) {
        membership = {
          orgId: memberRecord.orgId,
          role: memberRecord.role,
          permissions: memberRecord.permissions,
        };
        await redis.redis.hset(
          `user:${userKey}:orgs`,
          String(memberRecord.orgId),
          `${memberRecord.role}:${memberRecord.permissions.toString()}`,
        );
        await redis.redis.expire(`user:${userKey}:orgs`, 86400);
      }
    }

    if (!membership) {
      return { org: null };
    }

    const requestedStreamerIdHeader = headers["x-streamer-id"] || (cookie?.ab_streamer_id?.value as string | undefined);
    let targetStreamerId: bigint | null = null;

    if (requestedStreamerIdHeader) {
      targetStreamerId = await resolveStreamerId(membership.orgId, requestedStreamerIdHeader);
    }

    if (!targetStreamerId) {
      const streamer = await prisma.client.streamer.findFirst({
        where: { orgId: membership.orgId, deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: "asc" },
      });
      if (streamer) {
        targetStreamerId = streamer.id;
      }
    }

    if (!targetStreamerId) {
      return { org: null };
    }

    return {
      org: {
        orgId: membership.orgId,
        streamerId: targetStreamerId,
        role: membership.role,
        permissions: membership.permissions,
      },
    };
  });

/**
 * Helper to assert permission in endpoints.
 */
export function requireOrgPermission(org: OrgContext | null, requiredPerm: bigint): boolean {
  if (!org) return false;
  return hasPermission(org.permissions, requiredPerm);
}

export interface OrgCallerContext {
  orgId: bigint;
  role: OrgRole;
  permissions: bigint;
}

export function parseBigIntParam(val?: string | null): bigint | null {
  if (!val) return null;
  try {
    return BigInt(val);
  } catch {
    return null;
  }
}

export async function getMemberPermissions(
  orgId: bigint,
  userId: bigint,
): Promise<{ role: OrgRole; permissions: bigint } | null> {
  const cached = await redis.redis.hget(`user:${userId}:orgs`, String(orgId));
  if (cached) {
    const parts = cached.split(":");
    if (parts.length === 2) {
      return { role: parts[0] as OrgRole, permissions: BigInt(parts[1]) };
    }
  }

  const callerMember = await prisma.client.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { permissions: true, role: true, isDeleted: true },
  });

  if (callerMember && !callerMember.isDeleted) {
    void redis.redis
      .hset(
        `user:${userId}:orgs`,
        String(orgId),
        `${callerMember.role}:${callerMember.permissions.toString()}`,
      )
      .catch(() => {});
    return { role: callerMember.role, permissions: callerMember.permissions };
  }

  return null;
}

export async function authorizeOrg(
  orgParam: string | null | undefined,
  userId: bigint,
  requiredPerm: bigint,
  set: { status?: any },
  actionDescription = "perform this action",
): Promise<OrgCallerContext | string> {
  const orgId = await resolveOrgId(orgParam);
  if (!orgId) {
    set.status = "Bad Request";
    return "Invalid organization ID";
  }

  const member = await getMemberPermissions(orgId, userId);
  if (!member || !hasPermission(member.permissions, requiredPerm)) {
    set.status = "Forbidden";
    return `Insufficient permissions to ${actionDescription}`;
  }

  return { orgId, role: member.role, permissions: member.permissions };
}

export interface StreamerCallerContext {
  orgId: bigint;
  streamerId: bigint;
  role: OrgRole;
  permissions: bigint;
  streamerPermissions: number;
}

export async function authorizeStreamer(
  orgParam: string | null | undefined,
  streamerParam: string | null | undefined,
  userId: bigint,
  options: {
    requiredOrgPerm?: bigint;
    requiredStreamerPerm?: number;
    actionDescription?: string;
  },
  set: { status?: any },
): Promise<StreamerCallerContext | string> {
  const orgId = await resolveOrgId(orgParam);
  if (!orgId) {
    set.status = "Bad Request";
    return "Invalid organization ID";
  }

  const streamerId = await resolveStreamerId(orgId, streamerParam);
  if (!streamerId) {
    set.status = "Bad Request";
    return "Invalid organization or streamer ID";
  }

  const callerMember = await prisma.client.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    select: { id: true, permissions: true, role: true, isDeleted: true },
  });

  if (!callerMember || callerMember.isDeleted) {
    set.status = "Forbidden";
    return `Insufficient permissions to ${options.actionDescription || "access channel"}`;
  }

  const isOwnerOrAdmin = callerMember.role === "OWNER" || callerMember.role === "ADMIN";
  if (isOwnerOrAdmin) {
    return {
      orgId,
      streamerId,
      role: callerMember.role,
      permissions: callerMember.permissions,
      streamerPermissions: StreamerPerm.ALL,
    };
  }

  const hasGlobalOrgPerm = options.requiredOrgPerm
    ? hasPermission(callerMember.permissions, options.requiredOrgPerm)
    : false;

  let streamerPerms = 0;
  const cachedAssignments = await redis.redis.get(`org:${String(orgId)}:member:${String(callerMember.id)}:streamers`);
  if (cachedAssignments) {
    try {
      const parsed = JSON.parse(cachedAssignments);
      const assignment = parsed.find((a: any) => String(a.streamerId) === String(streamerId));
      if (assignment) {
        streamerPerms = parseStreamerPermissions(assignment.permissions);
      }
    } catch {}
  }

  // Inherit channel perms from org permissions if granted
  if (hasPermission(callerMember.permissions, OrgPerm.STREAMER_VIEW)) {
    streamerPerms |= StreamerPerm.STREAMER_VIEW;
  }
  if (hasPermission(callerMember.permissions, OrgPerm.STREAMER_MANAGE)) {
    streamerPerms |= StreamerPerm.STREAMER_MANAGE;
  }
  if (hasPermission(callerMember.permissions, OrgPerm.TRANSACTION_VIEW)) {
    streamerPerms |= StreamerPerm.STREAMER_TRANSACTION_VIEW;
  }
  if (hasPermission(callerMember.permissions, OrgPerm.ANALYTICS_VIEW)) {
    streamerPerms |= StreamerPerm.STREAMER_ANALYTICS_VIEW;
  }
  if (
    hasPermission(callerMember.permissions, OrgPerm.WIDGET_MANAGE) ||
    hasPermission(callerMember.permissions, OrgPerm.WIDGET_VIEW)
  ) {
    streamerPerms |= StreamerPerm.STREAMER_WIDGET_MANAGE;
  }
  if (hasPermission(callerMember.permissions, OrgPerm.INTEGRATION_MANAGE)) {
    streamerPerms |= StreamerPerm.STREAMER_INTEGRATION_MANAGE;
  }

  const hasChannelPerm = options.requiredStreamerPerm !== undefined
    ? hasStreamerPermission(streamerPerms, options.requiredStreamerPerm)
    : streamerPerms > 0;

  if (!hasGlobalOrgPerm && !hasChannelPerm) {
    set.status = "Forbidden";
    return `Insufficient permissions to ${options.actionDescription || "access channel"}`;
  }

  return {
    orgId,
    streamerId,
    role: callerMember.role,
    permissions: callerMember.permissions,
    streamerPermissions: streamerPerms,
  };
}
