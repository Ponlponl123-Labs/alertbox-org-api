import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm, RolePresets } from "@/utils/rbac";
import { OrgRole } from "@/generated/prisma/client";
import { authorizeOrg, parseBigIntParam } from "@/core/org";
import { logOrgAudit } from "@/core/audit";
import { updateMemberCache } from "@/utils/cache-sync";

export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/:orgId/members/:memberId",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const targetMemberId = parseBigIntParam(params.memberId);
      if (!targetMemberId) {
        set.status = "Bad Request";
        return "Invalid ID parameters";
      }

      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_ROLES_MANAGE, set, "manage roles");
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid ID parameters" : authRes;
      const { orgId, role: callerRole } = authRes;

      const targetMember = await prisma.client.organizationMember.findUnique({
        where: { id: targetMemberId },
      });

      if (!targetMember || targetMember.orgId !== orgId || targetMember.isDeleted) {
        set.status = "Not Found";
        return "Member not found";
      }

      if (body.role === "OWNER") {
        set.status = "Forbidden";
        return "Cannot assign OWNER role via member update. Use ownership transfer.";
      }

      if (targetMember.role === "OWNER") {
        set.status = "Forbidden";
        return "Cannot modify OWNER member. Use ownership transfer.";
      }

      const updateData: any = {};
      if (body.role) {
        updateData.role = body.role;
        updateData.permissions = (RolePresets[body.role as OrgRole] ?? RolePresets.MEMBER) & ~OrgPerm.ORG_DELETE;
      }
      if (body.permissions !== undefined) {
        updateData.permissions = BigInt(body.permissions) & ~OrgPerm.ORG_DELETE;
      }

      const updated = await prisma.client.organizationMember.update({
        where: { id: targetMemberId },
        data: updateData,
      });

      if (body.streamerAssignments !== undefined) {
        await redis.redis.set(
          `org:${String(orgId)}:member:${String(targetMemberId)}:streamers`,
          JSON.stringify(body.streamerAssignments),
        );
      }

      await updateMemberCache(orgId, targetMemberId, targetMember.userId, {
        role: updated.role,
        permissions: updated.permissions.toString(),
      });

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "MEMBER_ROLE_UPDATED",
        targetType: "MEMBER",
        targetId: targetMemberId,
        payload: {
          targetUserId: String(targetMember.userId),
          role: updated.role,
          permissions: updated.permissions.toString(),
          streamerAssignmentsCount: body.streamerAssignments ? body.streamerAssignments.length : undefined,
        },
      });

      return {
        id: String(updated.id),
        userId: String(updated.userId),
        role: updated.role,
        permissions: updated.permissions.toString(),
        streamerAssignments: body.streamerAssignments,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Update member role and permissions",
        description: "Updates a team member's role, custom bitmask permissions, and streamer assignments. Requires MANAGE_ROLES.",
      },
      body: t.Object({
        role: t.Optional(t.Enum(OrgRole)),
        permissions: t.Optional(t.String()),
        streamerAssignments: t.Optional(
          t.Array(
            t.Object({
              streamerId: t.String(),
              permissions: t.Array(t.String()),
            }),
          ),
        ),
      }),
    },
  );

export default endpoint;
