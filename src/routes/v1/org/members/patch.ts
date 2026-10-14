import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm, RolePresets } from "@/utils/rbac";
import { OrgRole } from "@/generated/prisma/client";
import { resolveOrgId } from "@/core/org";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/:orgId/members/:memberId",
    async ({ getAuthenticatedUser, params, body, set }) => {
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

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.MANAGE_ROLES)) {
        set.status = "Forbidden";
        return "Insufficient permissions to manage roles";
      }

      const targetMember = await prisma.client.organizationMember.findUnique({
        where: { id: targetMemberId },
      });

      if (!targetMember || targetMember.orgId !== orgId) {
        set.status = "Not Found";
        return "Member not found";
      }

      if (targetMember.role === "OWNER" && callerMember.role !== "OWNER") {
        set.status = "Forbidden";
        return "Cannot modify OWNER member";
      }

      const updateData: any = {};
      if (body.role) {
        updateData.role = body.role;
        updateData.permissions = RolePresets[body.role as OrgRole] ?? RolePresets.MEMBER;
      }
      if (body.permissions !== undefined) {
        updateData.permissions = BigInt(body.permissions);
      }

      const updated = await prisma.client.organizationMember.update({
        where: { id: targetMemberId },
        data: updateData,
      });

      await redis.redis.del(`user:${String(targetMember.userId)}:orgs`);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "MEMBER_ROLE_UPDATED",
        targetType: "MEMBER",
        targetId: targetMemberId,
        payload: { targetUserId: String(targetMember.userId), role: updated.role, permissions: updated.permissions.toString() },
      });

      return {
        id: String(updated.id),
        userId: String(updated.userId),
        role: updated.role,
        permissions: updated.permissions.toString(),
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Update member role and permissions",
        description: "Updates a team member's role or custom 64-bit bitmask permissions. Requires MANAGE_ROLES.",
      },
      body: t.Object({
        role: t.Optional(t.Enum(OrgRole)),
        permissions: t.Optional(t.String()),
      }),
    },
  );

export default endpoint;
