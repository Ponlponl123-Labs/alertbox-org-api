import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { authorizeOrg, parseBigIntParam } from "@/core/org";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/members/:memberId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const targetMemberId = parseBigIntParam(params.memberId);
      if (!targetMemberId) {
        set.status = "Bad Request";
        return "Invalid ID parameters";
      }

      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_MEMBERS_MANAGE, set, "remove members");
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid ID parameters" : authRes;
      const { orgId } = authRes;

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

      await Promise.all([
        redis.redis.del(`user:${String(targetMember.userId)}:orgs`),
        redis.redis.del(`user:${String(targetMember.userId)}:org_list`),
        redis.redis.del(`org:${String(orgId)}:members`),
        redis.redis.del(`org:${String(orgId)}:info`),
      ]);

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
