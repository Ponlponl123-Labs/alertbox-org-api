import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { logOrgAudit } from "@/core/audit";

export async function getOrganizationDetails(orgId: bigint, userId: bigint) {
  const member = await prisma.client.organizationMember.findUnique({
    where: { orgId_userId: { orgId, userId } },
    include: {
      organization: {
        include: {
          _count: { select: { members: true, streamers: true } },
          streamers: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              displayName: true,
              avatar: true,
              uri: true,
              publishedAt: true,
            },
          },
        },
      },
    },
  });

  if (!member || member.organization.deletedAt) {
    return null;
  }

  return {
    id: String(member.organization.id),
    type: member.organization.type,
    name: member.organization.name,
    slug: member.organization.slug,
    avatar: member.organization.avatar,
    banner: member.organization.banner,
    role: member.role,
    permissions: member.permissions.toString(),
    memberCount: member.organization._count.members,
    streamers: member.organization.streamers.map((s) => ({
      ...s,
      id: String(s.id),
    })),
    createdAt: member.organization.createdAt,
  };
}

export async function listUserOrganizations(userId: bigint) {
  const memberships = await prisma.client.organizationMember.findMany({
    where: { userId, organization: { deletedAt: null } },
    include: {
      organization: {
        include: {
          _count: { select: { members: true, streamers: true } },
          streamers: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              displayName: true,
              avatar: true,
              uri: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: String(m.organization.id),
    type: m.organization.type,
    name: m.organization.name,
    slug: m.organization.slug,
    avatar: m.organization.avatar,
    banner: m.organization.banner,
    role: m.role,
    permissions: m.permissions.toString(),
    memberCount: m.organization._count.members,
    streamers: m.organization.streamers.map((s) => ({
      ...s,
      id: String(s.id),
    })),
    joinedAt: m.createdAt,
  }));
}

export async function deleteOrganization(orgId: bigint, userId: bigint) {
  const org = await prisma.client.organization.findUnique({
    where: { id: orgId },
    select: { ownerId: true },
  });

  if (!org || org.ownerId !== userId) {
    throw new Error("Only the organization owner can delete the organization");
  }

  await prisma.client.organization.update({
    where: { id: orgId },
    data: { deletedAt: new Date() },
  });

  await logOrgAudit({
    orgId,
    userId,
    action: "ORGANIZATION_DELETED",
    targetType: "ORGANIZATION",
    targetId: orgId,
    payload: {},
  });

  await Promise.all([
    redis.redis.del(`org:${String(orgId)}:info`),
    redis.redis.del(`org:${String(orgId)}:members`),
    redis.redis.del(`org:${String(orgId)}:streamers`),
    redis.redis.del(`org:${String(orgId)}:primary_streamer`),
    redis.redis.del(`user:${String(userId)}:orgs`),
    redis.redis.del(`user:${String(userId)}:org_list`),
  ]);

  return true;
}
