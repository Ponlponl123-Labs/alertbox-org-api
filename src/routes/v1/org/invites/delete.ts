import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission, OrgPerm } from "@/utils/rbac";
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

      const callerMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.MANAGE_MEMBERS)) {
        set.status = "Forbidden";
        return "Insufficient permissions to delete invites";
      }

      const invite = await prisma.client.organizationInvite.findUnique({
        where: { id: inviteId },
      });

      if (!invite || invite.orgId !== orgId) {
        set.status = "Not Found";
        return "Invite not found";
      }

      await prisma.client.organizationInvite.delete({
        where: { id: inviteId },
      });

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
