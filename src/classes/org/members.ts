import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { OrgRole } from "@/generated/prisma/client";

export async function listOrgMembers(orgId: bigint | string) {
  const targetOrgId = BigInt(orgId);
  const members = await prisma.client.organizationMember.findMany({
    where: { orgId: targetOrgId, isDeleted: null },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          createdAt: true,
        },
      },
      organization: {
        select: {
          streamers: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              displayName: true,
              avatar: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return members.map((m) => ({
    id: String(m.id),
    userId: String(m.userId),
    role: m.role,
    permissions: m.permissions.toString(),
    createdAt: m.createdAt,
    user: {
      id: String(m.user.id),
      email: m.user.email,
      name: m.user.name,
      avatar: m.user.avatar,
      joinedAt: m.user.createdAt,
    },
    assignedStreamers: (m.organization?.streamers || []).map((s) => ({
      id: String(s.id),
      name: s.name,
      displayName: s.displayName,
      avatar: s.avatar,
    })),
  }));
}

export async function updateOrgMemberRole(
  orgId: bigint | string,
  targetUserId: bigint | string,
  role: OrgRole,
  permissions?: bigint,
) {
  const targetOrgId = BigInt(orgId);
  const targetUid = BigInt(targetUserId);

  const updated = await prisma.client.organizationMember.update({
    where: { orgId_userId: { orgId: targetOrgId, userId: targetUid } },
    data: {
      role,
      ...(permissions !== undefined ? { permissions } : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
        },
      },
    },
  });

  await Promise.all([
    redis.redis.del(`org:${String(orgId)}:members`),
    redis.redis.del(`user:${String(targetUserId)}:orgs`),
  ]);

  return {
    id: String(updated.id),
    userId: String(updated.userId),
    role: updated.role,
    permissions: updated.permissions.toString(),
    user: {
      id: String(updated.user.id),
      email: updated.user.email,
      name: updated.user.name,
      avatar: updated.user.avatar,
    },
  };
}

export async function removeOrgMember(
  orgId: bigint | string,
  targetUserId: bigint | string,
) {
  const targetOrgId = BigInt(orgId);
  const targetUid = BigInt(targetUserId);

  await prisma.client.organizationMember.update({
    where: { orgId_userId: { orgId: targetOrgId, userId: targetUid } },
    data: { isDeleted: new Date() },
  });

  await Promise.all([
    redis.redis.del(`org:${String(orgId)}:members`),
    redis.redis.del(`user:${String(targetUserId)}:orgs`),
    redis.redis.del(`user:${String(targetUserId)}:org_list`),
  ]);

  return true;
}
