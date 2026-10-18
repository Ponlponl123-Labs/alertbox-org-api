import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
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

      const member = await db
        .selectFrom("OrganizationMember")
        .selectAll()
        .where("orgId", "=", Number(orgId))
        .where("userId", "=", Number(user.data.id))
        .executeTakeFirst();

      if (!member || member.isDeleted) {
        set.status = "Not Found";
        return "You are not an active member of this organization";
      }

      if (member.role === "OWNER") {
        set.status = "Forbidden";
        return "Organization owner cannot leave. Transfer ownership or delete the organization first.";
      }

      await db
        .updateTable("OrganizationMember")
        .set({ isDeleted: new Date() })
        .where("id", "=", member.id)
        .execute();

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
        targetId: user.data.id,
        payload: {
          targetUserId: String(user.data.id),
          role: member.role,
        },
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
