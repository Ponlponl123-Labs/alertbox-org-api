import Elysia from "elysia";
import { auth } from "./auth";
import { prisma } from "./prisma";
import { redis } from "./redis";
import { hasPermission } from "@/utils/rbac";
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
      const numericId = BigInt(trimmed);
      const exists = await prisma.client.organization.findUnique({
        where: { id: numericId },
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

    // 1. Resolve target Org ID from header/cookie or find user's default/first org
    const requestedOrgIdHeader = headers["x-org-id"] || (cookie?.ab_org_id?.value as string | undefined);
    let targetOrgId: bigint | null = null;

    if (requestedOrgIdHeader) {
      targetOrgId = await resolveOrgId(requestedOrgIdHeader);
    }

    // 2. Fetch membership (from Redis hash or DB)
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
          // ignore cache format error and fallback
        }
      }
    }

    if (!membership) {
      // Query DB for user's memberships
      const memberRecord = await prisma.client.organizationMember.findFirst({
        where: targetOrgId ? { userId, orgId: targetOrgId } : { userId },
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
        // Cache in Redis hash (TTL 24 hours)
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

    // 3. Resolve active Streamer ID in this Org
    const requestedStreamerIdHeader = headers["x-streamer-id"] || (cookie?.ab_streamer_id?.value as string | undefined);
    let targetStreamerId: bigint | null = null;

    if (requestedStreamerIdHeader) {
      targetStreamerId = await resolveStreamerId(membership.orgId, requestedStreamerIdHeader);
    }

    if (!targetStreamerId) {
      // Find primary/first streamer in this org (with cache)
      const cachedStreamerId = await redis.redis.get(`org:${membership.orgId}:primary_streamer`);
      if (cachedStreamerId) {
        targetStreamerId = BigInt(cachedStreamerId);
      } else {
        const streamer = await prisma.client.streamer.findFirst({
          where: { orgId: membership.orgId, deletedAt: null },
          select: { id: true },
          orderBy: { createdAt: "asc" },
        });
        if (streamer) {
          targetStreamerId = streamer.id;
          await redis.redis.setex(
            `org:${membership.orgId}:primary_streamer`,
            3600,
            String(streamer.id),
          );
        }
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
