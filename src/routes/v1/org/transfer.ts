import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { RolePresets } from "@/utils/rbac";
import { OrgRole } from "@/generated/prisma/client";
import { authorizeOrg, parseBigIntParam } from "@/core/org";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/transfer",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const targetMemberId = parseBigIntParam(body.targetMemberId);
      if (!targetMemberId) {
        set.status = "Bad Request";
        return "Invalid target member ID";
      }

      const authRes = await authorizeOrg(params.orgId, user.data.id, BigInt(0), set, "transfer ownership");
      if (typeof authRes === "string") return authRes;
      const { orgId, role: callerRole } = authRes;

      if (callerRole !== "OWNER") {
        set.status = "Forbidden";
        return "Only the organization OWNER can transfer ownership";
      }

      const targetMember = await prisma.client.organizationMember.findUnique({
        where: { id: targetMemberId },
      });

      if (!targetMember || targetMember.orgId !== orgId) {
        set.status = "Not Found";
        return "Target member not found in this organization";
      }

      if (targetMember.userId === user.data.id) {
        set.status = "Bad Request";
        return "You are already the owner of this organization";
      }

      // Single-owner transaction: Demote caller to ADMIN, promote target to OWNER
      await prisma.client.$transaction([
        prisma.client.organizationMember.update({
          where: { orgId_userId: { orgId, userId: user.data.id } },
          data: {
            role: OrgRole.ADMIN,
            permissions: RolePresets.ADMIN,
          },
        }),
        prisma.client.organizationMember.update({
          where: { id: targetMemberId },
          data: {
            role: OrgRole.OWNER,
            permissions: RolePresets.OWNER,
          },
        }),
      ]);

      await Promise.all([
        redis.redis.del(`user:${user.data.id}:org_list`),
        redis.redis.del(`user:orgs:${user.data.id}`),
        redis.redis.del(`user:primary_org:${user.data.id}`),
        redis.redis.hdel(`user:${user.data.id}:orgs`, String(orgId)),
        redis.redis.del(`user:${targetMember.userId}:org_list`),
        redis.redis.del(`user:orgs:${targetMember.userId}`),
        redis.redis.del(`user:primary_org:${targetMember.userId}`),
        redis.redis.hdel(`user:${targetMember.userId}:orgs`, String(orgId)),
        redis.redis.del(`org:${String(orgId)}:members`),
        redis.redis.del(`org:${String(orgId)}:info`),
      ]);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "ORGANIZATION_TRANSFERRED",
        targetType: "ORGANIZATION",
        targetId: orgId,
        payload: {
          previousOwnerId: String(user.data.id),
          newOwnerMemberId: String(targetMemberId),
          newOwnerUserId: String(targetMember.userId),
        },
      });

      return {
        success: true,
        previousOwnerId: String(user.data.id),
        newOwnerId: String(targetMember.userId),
        newOwnerMemberId: String(targetMemberId),
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Transfer organization ownership",
        description: "Transfers primary organization ownership to another member. Caller must be OWNER. Demotes previous owner to ADMIN.",
      },
      body: t.Object({
        targetMemberId: t.String(),
      }),
    },
  );

export default endpoint;
