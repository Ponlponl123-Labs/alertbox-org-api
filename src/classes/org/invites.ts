import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { OrgRole } from "@/generated/prisma/client";
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
  const targetOrgId = BigInt(orgId);
  const cleanEmail = email.trim().toLowerCase();

  const targetUser = await prisma.client.user.findUnique({
    where: { email: cleanEmail },
    select: { id: true, name: true, avatar: true },
  });

  if (!targetUser) {
    throw new Error("No registered user found with this email");
  }

  const alreadyMember = await prisma.client.organizationMember.findUnique({
    where: { orgId_userId: { orgId: targetOrgId, userId: targetUser.id } },
  });
  if (alreadyMember && !alreadyMember.isDeleted) {
    throw new Error("User is already a member of this organization");
  }

  const effectivePerms = permissions !== undefined ? permissions : (RolePresets[role] ?? RolePresets.MEMBER);

  // Invalidate any older unaccepted invites for this org to keep single active code
  await prisma.client.organizationInvite.updateMany({
    where: { orgId: targetOrgId, acceptedAt: null },
    data: { expiresAt: new Date() },
  });

  const token = generate8DigitCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

  const invite = await prisma.client.organizationInvite.create({
    data: {
      orgId: targetOrgId,
      inviterId,
      email: cleanEmail,
      role,
      permissions: effectivePerms,
      token,
      expiresAt,
    },
  });

  await logOrgAudit({
    orgId: targetOrgId,
    userId: inviterId,
    action: "MEMBER_INVITED",
    targetType: "USER",
    targetId: targetUser.id,
    payload: { email: cleanEmail, role, expiresAt: expiresAt.toISOString() },
  });

  return {
    id: String(invite.id),
    email: invite.email,
    role: invite.role,
    code: invite.token,
    token: invite.token,
    expiresAt: invite.expiresAt,
  };
}

export async function verifyOrgInviteCode(code: string, userEmail: string) {
  const cleanCode = code.trim();
  const cleanEmail = userEmail.trim().toLowerCase();

  const invite = await prisma.client.organizationInvite.findUnique({
    where: { token: cleanCode },
    include: {
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          avatar: true,
          banner: true,
          _count: { select: { members: true } },
        },
      },
      inviter: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
        },
      },
    },
  });

  if (!invite) throw new Error("Invalid or expired invitation code");
  if (invite.acceptedAt) throw new Error("Invitation has already been used");
  if (new Date() > invite.expiresAt) throw new Error("Invitation code has expired (5-minute limit)");
  if (invite.email.toLowerCase() !== cleanEmail) {
    throw new Error("This invitation was issued for another email address");
  }

  return {
    id: String(invite.id),
    code: invite.token,
    role: invite.role,
    organization: {
      id: String(invite.organization.id),
      name: invite.organization.name,
      slug: invite.organization.slug,
      avatar: invite.organization.avatar,
      banner: invite.organization.banner,
      memberCount: invite.organization._count.members,
    },
    inviter: {
      id: String(invite.inviter.id),
      name: invite.inviter.name,
      avatar: invite.inviter.avatar,
    },
    expiresAt: invite.expiresAt,
  };
}

export async function acceptOrgInviteCode(code: string, userId: bigint) {
  const cleanCode = code.trim();

  const invite = await prisma.client.organizationInvite.findUnique({
    where: { token: cleanCode },
    include: { organization: true },
  });

  if (!invite) throw new Error("Invalid invitation code");
  if (invite.acceptedAt) throw new Error("Invitation has already been accepted");
  if (new Date() > invite.expiresAt) throw new Error("Invitation code has expired");

  const member = await prisma.client.$transaction(async (tx) => {
    await tx.organizationInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
    });

    return tx.organizationMember.upsert({
      where: { orgId_userId: { orgId: invite.orgId, userId } },
      create: {
        orgId: invite.orgId,
        userId,
        role: invite.role,
        permissions: invite.permissions,
      },
      update: {
        role: invite.role,
        permissions: invite.permissions,
        isDeleted: null,
      },
    });
  });

  await Promise.all([
    redis.redis.del(`org:${String(invite.orgId)}:members`),
    redis.redis.del(`user:${String(userId)}:orgs`),
  ]);

  return {
    orgId: String(invite.orgId),
    role: member.role,
    orgSlug: invite.organization.slug,
  };
}
