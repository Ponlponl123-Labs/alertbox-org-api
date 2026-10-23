import { db, OrgRole } from "@/db";
import { redis } from "@/core/redis";
import { RolePresets } from "@/consts/permission";
import { customAlphabet } from "nanoid";
import { logOrgAudit } from "@/core/audit";

const generate8DigitCode = customAlphabet("0123456789", 8);

export async function createOrgInvite(
  orgId: bigint | string,
  inviterId: bigint,
  email: string,
  role: OrgRole = OrgRole.MEMBER,
  permissions?: bigint,
) {
  const targetOrgId = Number(orgId);
  const cleanEmail = email.trim().toLowerCase();

  const targetUser = await db
    .selectFrom("User")
    .select(["id", "name", "avatar"])
    .where("email", "=", cleanEmail)
    .executeTakeFirst();

  if (!targetUser) {
    throw new Error("No registered user found with this email");
  }

  const alreadyMember = await db
    .selectFrom("OrganizationMember")
    .select(["id", "isDeleted"])
    .where("orgId", "=", targetOrgId)
    .where("userId", "=", targetUser.id)
    .executeTakeFirst();

  if (alreadyMember && !alreadyMember.isDeleted) {
    throw new Error("User is already a member of this organization");
  }

  const effectivePerms = permissions !== undefined ? permissions : (RolePresets[role] ?? RolePresets.MEMBER);

  // Invalidate any older unaccepted invites for this org to keep single active code
  await db
    .updateTable("OrganizationInvite")
    .set({ expiresAt: new Date() })
    .where("orgId", "=", targetOrgId)
    .where("acceptedAt", "is", null)
    .execute();

  const token = generate8DigitCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

  const insertRes = await db
    .insertInto("OrganizationInvite")
    .values({
      orgId: targetOrgId,
      inviterId: Number(inviterId),
      email: cleanEmail,
      role,
      permissions: BigInt(effectivePerms),
      token,
      expiresAt,
    })
    .executeTakeFirstOrThrow();

  const insertedId = insertRes.insertId ? String(insertRes.insertId) : "";

  await logOrgAudit({
    orgId: BigInt(targetOrgId),
    userId: inviterId,
    action: "MEMBER_INVITED",
    targetType: "MEMBER",
    targetId: BigInt(targetUser.id),
    payload: { email: cleanEmail, role, expiresAt: expiresAt.toISOString() },
  });

  return {
    id: insertedId,
    email: cleanEmail,
    role,
    code: token,
    token,
    expiresAt,
  };
}

export async function verifyOrgInviteCode(code: string, userEmail: string) {
  const cleanCode = code.trim();
  const cleanEmail = userEmail.trim().toLowerCase();

  const invite = await db
    .selectFrom("OrganizationInvite")
    .innerJoin("Organization", "Organization.id", "OrganizationInvite.orgId")
    .innerJoin("User as inviter", "inviter.id", "OrganizationInvite.inviterId")
    .select([
      "OrganizationInvite.id as id",
      "OrganizationInvite.token as token",
      "OrganizationInvite.role as role",
      "OrganizationInvite.email as email",
      "OrganizationInvite.acceptedAt as acceptedAt",
      "OrganizationInvite.expiresAt as expiresAt",
      "Organization.id as orgId",
      "Organization.name as orgName",
      "Organization.slug as orgSlug",
      "Organization.avatar as orgAvatar",
      "Organization.banner as orgBanner",
      "inviter.id as inviterId",
      "inviter.name as inviterName",
      "inviter.avatar as inviterAvatar",
    ])
    .where("OrganizationInvite.token", "=", cleanCode)
    .executeTakeFirst();

  if (!invite) throw new Error("Invalid or expired invitation code");
  if (invite.acceptedAt) throw new Error("Invitation has already been used");
  if (new Date() > invite.expiresAt) throw new Error("Invitation code has expired (5-minute limit)");
  if (invite.email.toLowerCase() !== cleanEmail) {
    throw new Error("This invitation was issued for another email address");
  }

  const countRow = await db
    .selectFrom("OrganizationMember")
    .select((eb) => eb.fn.count("id").as("count"))
    .where("orgId", "=", invite.orgId)
    .where("isDeleted", "is", null)
    .executeTakeFirst();

  return {
    id: String(invite.id),
    code: invite.token,
    role: invite.role,
    organization: {
      id: String(invite.orgId),
      name: invite.orgName,
      slug: invite.orgSlug,
      avatar: invite.orgAvatar,
      banner: invite.orgBanner,
      memberCount: Number(countRow?.count ?? 0),
    },
    inviter: {
      id: String(invite.inviterId),
      name: invite.inviterName,
      avatar: invite.inviterAvatar,
    },
    expiresAt: invite.expiresAt,
  };
}

export async function acceptOrgInviteCode(code: string, userId: bigint) {
  const cleanCode = code.trim();

  const invite = await db
    .selectFrom("OrganizationInvite")
    .innerJoin("Organization", "Organization.id", "OrganizationInvite.orgId")
    .select([
      "OrganizationInvite.id as id",
      "OrganizationInvite.token as token",
      "OrganizationInvite.orgId as orgId",
      "OrganizationInvite.role as role",
      "OrganizationInvite.permissions as permissions",
      "OrganizationInvite.acceptedAt as acceptedAt",
      "OrganizationInvite.expiresAt as expiresAt",
      "Organization.slug as orgSlug",
    ])
    .where("OrganizationInvite.token", "=", cleanCode)
    .executeTakeFirst();

  if (!invite) throw new Error("Invalid invitation code");
  if (invite.acceptedAt) throw new Error("Invitation has already been accepted");
  if (new Date() > invite.expiresAt) throw new Error("Invitation code has expired");

  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable("OrganizationInvite")
      .set({ acceptedAt: new Date() })
      .where("id", "=", invite.id)
      .execute();

    await trx
      .insertInto("OrganizationMember")
      .values({
        orgId: invite.orgId,
        userId: Number(userId),
        role: invite.role,
        permissions: BigInt(invite.permissions),
        updatedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        role: invite.role,
        permissions: BigInt(invite.permissions),
        isDeleted: null,
        updatedAt: new Date(),
      })
      .execute();
  });

  await Promise.all([
    redis.redis.del(`org:${String(invite.orgId)}:members`),
    redis.redis.del(`user:${String(userId)}:info`),
    redis.redis.del(`user:${String(userId)}:orgs`),
    redis.redis.del(`user:${String(userId)}:org_list`),
  ]);

  return {
    orgId: String(invite.orgId),
    role: invite.role,
    orgSlug: invite.orgSlug,
  };
}
