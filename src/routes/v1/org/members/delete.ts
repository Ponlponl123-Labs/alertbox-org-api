import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId } from "@/core/org";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/members/:memberId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      let targetMemberId: bigint;
      try {
        targetMemberId = BigInt(params.memberId);
      } catch {
        set.status = "Bad Request";
        return "Invalid ID parameters";
      }
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid ID parameters";
      }

      const callerMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.MANAGE_MEMBERS)) {
        set.status = "Forbidden";
        return "Insufficient permissions to remove members";
      }

      const targetMember = await prisma.client.organizationMember.findUnique({
        where: { id: targetMemberId },
      });

      if (!targetMember || targetMember.orgId !== orgId) {
        set.status = "Not Found";
        return "Member not found";
      }

      if (targetMember.role === "OWNER") {
        set.status = "Forbidden";
        return "Cannot remove organization OWNER";
      }

      await prisma.client.organizationMember.delete({
        where: { id: targetMemberId },
      });

      await redis.redis.del(`user:${String(targetMember.userId)}:orgs`);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "MEMBER_REMOVED",
        targetType: "MEMBER",
        targetId: targetMemberId,
        payload: { removedUserId: String(targetMember.userId), role: targetMember.role },
      });

      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Remove member from organization",
        description: "Removes a member from the organization. Requires MANAGE_MEMBERS permission.",
      },
    },
  );

export default endpoint;
