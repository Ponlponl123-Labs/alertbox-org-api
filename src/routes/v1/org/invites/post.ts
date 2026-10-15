import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission, OrgPerm, RolePresets } from "@/utils/rbac";
import { OrgRole } from "@/generated/prisma/client";
import { customAlphabet } from "nanoid";
import { resolveOrgId } from "@/core/org";
import { logOrgAudit } from "@/core/audit";

const generate8DigitCode = customAlphabet("0123456789", 8);

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/invites",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const callerMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.ORG_MEMBERS_MANAGE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to invite members";
      }

      const cleanEmail = body.email.trim().toLowerCase();
      if (body.role === "OWNER") {
        set.status = "Forbidden";
        return "Cannot invite a user as OWNER";
      }
      const role = body.role ?? OrgRole.MEMBER;
      let permissions = (RolePresets[role] ?? RolePresets.MEMBER) & ~OrgPerm.ORG_DELETE;
      if (body.permissions !== undefined) {
        try {
          permissions = BigInt(body.permissions) & ~OrgPerm.ORG_DELETE;
        } catch {
          // fallback to role default
        }
      }

      const targetUser = await prisma.client.user.findUnique({
        where: { email: cleanEmail },
        select: { id: true, name: true, avatar: true },
      });

      if (!targetUser) {
        set.status = "Not Found";
        return "No registered user found with this email";
      }

      const alreadyMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: targetUser.id } },
      });
      if (alreadyMember) {
        set.status = "Conflict";
        return "User is already a member of this organization";
      }

      // Expire older unaccepted invites for this specific email
      await prisma.client.organizationInvite.updateMany({
        where: { orgId, email: cleanEmail, acceptedAt: null },
        data: { expiresAt: new Date() },
      });

      const token = generate8DigitCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

      const invite = await prisma.client.organizationInvite.create({
        data: {
          orgId,
          inviterId: user.data.id,
          email: cleanEmail,
          role,
          permissions,
          token,
          expiresAt,
        },
      });

      await logOrgAudit({
        orgId,
        userId: user.data.id,
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
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Invite a new member",
        description: "Creates an 8-digit single-use invitation code valid for 5 minutes.",
      },
      body: t.Object({
        email: t.String({ format: "email" }),
        role: t.Optional(t.Enum(OrgRole)),
        permissions: t.Optional(t.String()),
      }),
    },
  );

export default endpoint;
