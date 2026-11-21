import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { hasAnyPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/invites/:inviteId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      let inviteId: bigint;
      try {
        inviteId = BigInt(params.inviteId);
      } catch {
        set.status = "Bad Request";
        return "Invalid invite ID";
      }
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

      if (!callerMember || !hasAnyPermission(BigInt(callerMember.permissions), OrgPerm.ORG_MEMBER_ADD | OrgPerm.ORG_MEMBER_REMOVE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to delete invites";
      }

      const invite = await db
        .selectFrom("OrganizationInvite")
        .select(["id", "orgId"])
        .where("id", "=", Number(inviteId))
        .executeTakeFirst();

      if (!invite || BigInt(invite.orgId) !== orgId) {
        set.status = "Not Found";
        return "Invite not found";
      }

      await db
        .deleteFrom("OrganizationInvite")
        .where("id", "=", Number(inviteId))
        .execute();

      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Cancel pending organization invite",
        description: "Deletes an active organization invite.",
      },
    },
  );

export default endpoint;
