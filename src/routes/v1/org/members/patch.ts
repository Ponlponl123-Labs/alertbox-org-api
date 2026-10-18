import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db, OrgRole } from "@/db";
import { redis } from "@/core/redis";
import { hasAnyPermission } from "@/utils/rbac";
import { OrgPerm, RolePresets } from "@/consts/permission";
import { resolveOrgId, getMemberPermissions, parseBigIntParam } from "@/core/org";
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

      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const callerMember = await getMemberPermissions(orgId, user.data.id);
      const isOwner = callerMember?.role === "OWNER";
      const isAdmin = callerMember?.role === "ADMIN";
      const canManage = callerMember && (
        isOwner ||
        isAdmin ||
        hasAnyPermission(callerMember.permissions, OrgPerm.ORG_MEMBER_MODIFY | OrgPerm.ORG_ROLES_MANAGE)
      );

      if (!callerMember || !canManage) {
        set.status = "Forbidden";
        return "Insufficient permissions to manage members";
      }

      const callerPerms = isOwner ? OrgPerm.ALL : callerMember.permissions;

      const targetMember = await db
        .selectFrom("OrganizationMember")
        .select(["id", "orgId", "userId", "role", "permissions", "isDeleted"])
        .where("id", "=", Number(targetMemberId))
        .executeTakeFirst();

      if (!targetMember || BigInt(targetMember.orgId) !== orgId || targetMember.isDeleted) {
        set.status = "Not Found";
        return "Member not found";
      }

      if (BigInt(targetMember.userId) === user.data.id) {
        set.status = "Forbidden";
        return "Cannot modify your own membership. Self-management is disabled.";
      }

      if (targetMember.role === "OWNER") {
        set.status = "Forbidden";
        return "Cannot modify OWNER member. Use ownership transfer.";
      }

      if (!isOwner) {
        if (targetMember.role === "ADMIN" && !isAdmin) {
          set.status = "Forbidden";
          return "Cannot modify an Administrator member.";
        }
        const targetPerms = BigInt(targetMember.permissions || "0");
        if ((targetPerms & ~callerPerms) !== 0n) {
          set.status = "Forbidden";
          return "Cannot modify a member with permissions higher than your own.";
        }
      }

      if (body.role === "OWNER") {
        set.status = "Forbidden";
        return "Cannot assign OWNER role via member update. Use ownership transfer.";
      }

      const updateData: Record<string, any> = { updatedAt: new Date() };
      if (body.role) {
        const rolePerms = (RolePresets[body.role as OrgRole] ?? RolePresets.MEMBER) & ~OrgPerm.ORG_DELETE;
        if (!isOwner && (rolePerms & ~callerPerms) !== 0n) {
          set.status = "Forbidden";
          return "Cannot assign a role with permissions higher than your own.";
        }
        updateData.role = body.role;
        updateData.permissions = Number(rolePerms);
      }

      if (body.permissions !== undefined) {
        const requestedPerms = BigInt(body.permissions) & ~OrgPerm.ORG_DELETE;
        if (!isOwner && (requestedPerms & ~callerPerms) !== 0n) {
          set.status = "Forbidden";
          return "Cannot grant permissions higher than your own.";
        }
        updateData.permissions = Number(requestedPerms);
      }

      await db
        .updateTable("OrganizationMember")
        .set(updateData)
        .where("id", "=", Number(targetMemberId))
        .execute();

      const updated = await db
        .selectFrom("OrganizationMember")
        .select(["id", "userId", "role", "permissions"])
        .where("id", "=", Number(targetMemberId))
        .executeTakeFirstOrThrow();

      if (body.streamerAssignments !== undefined) {
        await redis.redis.set(
          `org:${String(orgId)}:member:${String(targetMemberId)}:streamers`,
          JSON.stringify(body.streamerAssignments),
        );
      }

      await updateMemberCache(orgId, targetMemberId, BigInt(targetMember.userId), {
        role: updated.role,
        permissions: String(updated.permissions),
      });

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "MEMBER_ROLE_UPDATED",
        targetType: "MEMBER",
        targetId: BigInt(targetMember.userId),
        payload: {
          targetMemberId: String(targetMemberId),
          targetUserId: String(targetMember.userId),
          previousRole: targetMember.role,
          role: updated.role,
          previousPermissions: targetMember.permissions ? String(targetMember.permissions) : "0",
          permissions: String(updated.permissions),
          streamerAssignments: body.streamerAssignments ?? null,
          streamerAssignmentsCount: body.streamerAssignments ? body.streamerAssignments.length : undefined,
        },
      });

      return {
        id: String(updated.id),
        userId: String(updated.userId),
        role: updated.role,
        permissions: String(updated.permissions),
        streamerAssignments: body.streamerAssignments,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Update member role and permissions",
        description: "Updates a team member's role, custom bitmask permissions, and streamer assignments. Requires ORG_MEMBERS_MANAGE or ORG_ROLES_MANAGE, capped at caller's own permissions.",
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
