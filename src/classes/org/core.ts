import { db } from "@/db";
import { redis } from "@/core/redis";
import { logOrgAudit } from "@/core/audit";

export async function getOrganizationDetails(orgId: bigint, userId: bigint) {
  const row = await db
    .selectFrom("OrganizationMember")
    .innerJoin("Organization", "Organization.id", "OrganizationMember.orgId")
    .select([
      "Organization.id as orgId",
      "Organization.type as type",
      "Organization.name as name",
      "Organization.slug as slug",
      "Organization.avatar as avatar",
      "Organization.banner as banner",
      "Organization.createdAt as createdAt",
      "Organization.deletedAt as orgDeletedAt",
      "OrganizationMember.role as role",
      "OrganizationMember.permissions as permissions",
      "OrganizationMember.isDeleted as memberDeletedAt",
    ])
    .where("OrganizationMember.orgId", "=", Number(orgId))
    .where("OrganizationMember.userId", "=", Number(userId))
    .executeTakeFirst();

  if (!row || row.memberDeletedAt || row.orgDeletedAt) {
    return null;
  }

  const [streamers, memberCountResult] = await Promise.all([
    db
      .selectFrom("Streamer")
      .select(["id", "name", "displayName", "avatar", "uri", "publishedAt"])
      .where("orgId", "=", Number(orgId))
      .where("deletedAt", "is", null)
      .execute(),
    db
      .selectFrom("OrganizationMember")
      .select((eb) => eb.fn.count("id").as("count"))
      .where("orgId", "=", Number(orgId))
      .where("isDeleted", "is", null)
      .executeTakeFirst(),
  ]);

  return {
    id: String(row.orgId),
    type: row.type,
    name: row.name,
    slug: row.slug,
    avatar: row.avatar,
    banner: row.banner,
    role: row.role,
    permissions: row.permissions.toString(),
    memberCount: Number(memberCountResult?.count ?? 0),
    streamers: streamers.map((s) => ({
      ...s,
      id: String(s.id),
    })),
    createdAt: row.createdAt,
  };
}

export async function listUserOrganizations(userId: bigint) {
  const orgMemberships = await db
    .selectFrom("OrganizationMember")
    .innerJoin("Organization", "Organization.id", "OrganizationMember.orgId")
    .select([
      "Organization.id as orgId",
      "Organization.type as type",
      "Organization.name as name",
      "Organization.slug as slug",
      "Organization.avatar as avatar",
      "Organization.banner as banner",
      "OrganizationMember.role as role",
      "OrganizationMember.permissions as permissions",
      "OrganizationMember.createdAt as joinedAt",
    ])
    .where("OrganizationMember.userId", "=", Number(userId))
    .where("OrganizationMember.isDeleted", "is", null)
    .where("Organization.deletedAt", "is", null)
    .orderBy("OrganizationMember.createdAt", "asc")
    .execute();

  if (orgMemberships.length === 0) return [];

  const orgIds = orgMemberships.map((m) => m.orgId);

  const [streamers, memberCounts] = await Promise.all([
    db
      .selectFrom("Streamer")
      .select(["id", "orgId", "name", "displayName", "avatar", "uri"])
      .where("orgId", "in", orgIds)
      .where("deletedAt", "is", null)
      .execute(),
    db
      .selectFrom("OrganizationMember")
      .select(["orgId", (eb) => eb.fn.count("id").as("count")])
      .where("orgId", "in", orgIds)
      .where("isDeleted", "is", null)
      .groupBy("orgId")
      .execute(),
  ]);

  const streamersByOrg = new Map<string, any[]>();
  for (const s of streamers) {
    const key = String(s.orgId);
    const list = streamersByOrg.get(key) ?? [];
    list.push({ ...s, id: String(s.id) });
    streamersByOrg.set(key, list);
  }

  const countsByOrg = new Map<string, number>();
  for (const c of memberCounts) {
    countsByOrg.set(String(c.orgId), Number(c.count));
  }

  return orgMemberships.map((m) => ({
    id: String(m.orgId),
    type: m.type,
    name: m.name,
    slug: m.slug,
    avatar: m.avatar,
    banner: m.banner,
    role: m.role,
    permissions: m.permissions.toString(),
    memberCount: countsByOrg.get(String(m.orgId)) ?? 0,
    streamers: streamersByOrg.get(String(m.orgId)) ?? [],
    joinedAt: m.joinedAt,
  }));
}

export async function deleteOrganization(orgId: bigint, userId: bigint) {
  const org = await db
    .selectFrom("Organization")
    .select("ownerId")
    .where("id", "=", Number(orgId))
    .executeTakeFirst();

  if (!org || BigInt(org.ownerId) !== userId) {
    throw new Error("Only the organization owner can delete the organization");
  }

  await db
    .updateTable("Organization")
    .set({ deletedAt: new Date() })
    .where("id", "=", Number(orgId))
    .execute();

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
