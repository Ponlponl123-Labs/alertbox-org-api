import { db, OrgRole } from "@/db";
import { redis } from "@/core/redis";

export async function listOrgMembers(orgId: bigint | string) {
  const targetOrgId = Number(orgId);

  const [members, streamers] = await Promise.all([
    db
      .selectFrom("OrganizationMember")
      .innerJoin("User", "User.id", "OrganizationMember.userId")
      .select([
        "OrganizationMember.id as memberId",
        "OrganizationMember.userId as userId",
        "OrganizationMember.role as role",
        "OrganizationMember.permissions as permissions",
        "OrganizationMember.createdAt as createdAt",
        "User.id as uId",
        "User.email as uEmail",
        "User.name as uName",
        "User.avatar as uAvatar",
        "User.createdAt as uCreatedAt",
      ])
      .where("OrganizationMember.orgId", "=", targetOrgId)
      .where("OrganizationMember.isDeleted", "is", null)
      .orderBy("OrganizationMember.createdAt", "asc")
      .execute(),
    db
      .selectFrom("Streamer")
      .select(["id", "name", "displayName", "avatar"])
      .where("orgId", "=", targetOrgId)
      .where("deletedAt", "is", null)
      .execute(),
  ]);

  const assignedStreamers = streamers.map((s) => ({
    id: String(s.id),
    name: s.name,
    displayName: s.displayName,
    avatar: s.avatar,
  }));

  return members.map((m) => ({
    id: String(m.memberId),
    userId: String(m.userId),
    role: m.role,
    permissions: m.permissions.toString(),
    createdAt: new Date(m.createdAt),
    user: {
      id: String(m.uId),
      email: m.uEmail,
      name: m.uName,
      avatar: m.uAvatar,
      joinedAt: new Date(m.uCreatedAt),
    },
    assignedStreamers,
  }));
}

export async function updateOrgMemberRole(
  orgId: bigint | string,
  targetUserId: bigint | string,
  role: OrgRole,
  permissions?: bigint,
) {
  const targetOrgId = Number(orgId);
  const targetUid = Number(targetUserId);

  const patch: any = { role, updatedAt: new Date() };
  if (permissions !== undefined) {
    patch.permissions = permissions;
  }

  await db
    .updateTable("OrganizationMember")
    .set(patch)
    .where("orgId", "=", targetOrgId)
    .where("userId", "=", targetUid)
    .execute();

  const updated = await db
    .selectFrom("OrganizationMember")
    .innerJoin("User", "User.id", "OrganizationMember.userId")
    .select([
      "OrganizationMember.id as memberId",
      "OrganizationMember.userId as userId",
      "OrganizationMember.role as role",
      "OrganizationMember.permissions as permissions",
      "User.id as uId",
      "User.email as uEmail",
      "User.name as uName",
      "User.avatar as uAvatar",
    ])
    .where("OrganizationMember.orgId", "=", targetOrgId)
    .where("OrganizationMember.userId", "=", targetUid)
    .executeTakeFirstOrThrow();

  await Promise.all([
    redis.redis.del(`org:${String(orgId)}:members`),
    redis.redis.del(`user:${String(targetUserId)}:info`),
    redis.redis.del(`user:${String(targetUserId)}:orgs`),
    redis.redis.del(`user:${String(targetUserId)}:org_list`),
  ]);

  return {
    id: String(updated.memberId),
    userId: String(updated.userId),
    role: updated.role,
    permissions: updated.permissions.toString(),
    user: {
      id: String(updated.uId),
      email: updated.uEmail,
      name: updated.uName,
      avatar: updated.uAvatar,
    },
  };
}

export async function removeOrgMember(
  orgId: bigint | string,
  targetUserId: bigint | string,
) {
  const targetOrgId = Number(orgId);
  const targetUid = Number(targetUserId);

  await db
    .updateTable("OrganizationMember")
    .set({ isDeleted: new Date() })
    .where("orgId", "=", targetOrgId)
    .where("userId", "=", targetUid)
    .execute();

  await Promise.all([
    redis.redis.del(`org:${String(orgId)}:members`),
    redis.redis.del(`user:${String(targetUserId)}:info`),
    redis.redis.del(`user:${String(targetUserId)}:orgs`),
    redis.redis.del(`user:${String(targetUserId)}:org_list`),
  ]);

  return true;
}
