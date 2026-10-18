import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/invites/lookup",
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
      if (!cleanEmail) {
        set.status = "Bad Request";
        return "Email is required";
      }

      const targetUser = await db
        .selectFrom("User")
        .select(["id", "email", "name", "avatar", "disabledAt", "deletedAt"])
        .where("email", "=", cleanEmail)
        .executeTakeFirst();

      if (!targetUser || targetUser.disabledAt || targetUser.deletedAt) {
        set.status = "Not Found";
        return "No active registered user found with this email";
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

      return {
        id: String(targetUser.id),
        email: targetUser.email,
        name: targetUser.name,
        avatar: targetUser.avatar,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Lookup registered user by email before inviting",
        description: "Checks whether a registered, active user exists for the specified email and is not already a member.",
      },
      body: t.Object({
        email: t.String({ minLength: 3, maxLength: 256 }),
      }),
      response: {
        200: t.Object({
          id: t.String(),
          email: t.String(),
          name: t.Nullable(t.String()),
          avatar: t.Nullable(t.String()),
        }),
        400: t.String(),
        403: t.String(),
        404: t.String(),
        409: t.String(),
      },
    },
  );

export default endpoint;
