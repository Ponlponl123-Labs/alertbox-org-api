import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { resolveOrgId } from "@/core/org";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/leave",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const member = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!member || member.isDeleted) {
        set.status = "Not Found";
        return "You are not an active member of this organization";
      }

      if (member.role === "OWNER") {
        set.status = "Forbidden";
        return "Organization owner cannot leave. Transfer ownership or delete the organization first.";
      }

      await prisma.client.organizationMember.update({
        where: { id: member.id },
        data: { isDeleted: new Date() },
      });

      await Promise.all([
        redis.redis.del(`user:${String(user.data.id)}:orgs`),
        redis.redis.del(`user:${String(user.data.id)}:org_list`),
        redis.redis.del(`org:${String(orgId)}:members`),
        redis.redis.del(`org:${String(orgId)}:info`),
      ]);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "MEMBER_LEFT",
        targetType: "MEMBER",
        targetId: member.id,
        payload: { role: member.role },
      });

      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Leave organization",
        description: "Allows an active non-owner member to leave the organization.",
      },
    },
  );

export default endpoint;
