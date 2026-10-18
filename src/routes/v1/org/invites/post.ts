import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db, OrgRole } from "@/db";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm, RolePresets } from "@/consts/permission";
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

      const callerMember = await db
        .selectFrom("OrganizationMember")
        .select(["permissions"])
        .where("orgId", "=", Number(orgId))
        .where("userId", "=", Number(user.data.id))
        .executeTakeFirst();

      if (!callerMember || !hasPermission(BigInt(callerMember.permissions), OrgPerm.ORG_MEMBER_ADD)) {
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

      const targetUser = await db
        .selectFrom("User")
        .select(["id", "name", "avatar"])
        .where("email", "=", cleanEmail)
        .executeTakeFirst();

      if (!targetUser) {
        set.status = "Not Found";
        return "No registered user found with this email";
      }

      const alreadyMember = await db
        .selectFrom("OrganizationMember")
        .select(["id", "isDeleted"])
        .where("orgId", "=", Number(orgId))
        .where("userId", "=", Number(targetUser.id))
        .executeTakeFirst();
      if (alreadyMember && !alreadyMember.isDeleted) {
        set.status = "Conflict";
        return "User is already a member of this organization";
      }

      // Expire older unaccepted invites for this specific email
      await db
        .updateTable("OrganizationInvite")
        .set({ expiresAt: new Date() })
        .where("orgId", "=", Number(orgId))
        .where("email", "=", cleanEmail)
        .where("acceptedAt", "is", null)
        .execute();

      const token = generate8DigitCode();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min TTL

      const result = await db
        .insertInto("OrganizationInvite")
        .values({
          orgId: Number(orgId),
          inviterId: Number(user.data.id),
          email: cleanEmail,
          role,
          permissions: Number(permissions),
          token,
          expiresAt,
        })
        .executeTakeFirst();

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "MEMBER_INVITED",
        targetType: "MEMBER",
        targetId: BigInt(targetUser.id),
        payload: { email: cleanEmail, role, expiresAt: expiresAt.toISOString() },
      });

      return {
        id: String(result.insertId ?? ""),
        email: cleanEmail,
        role,
        code: token,
        token,
        expiresAt,
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
