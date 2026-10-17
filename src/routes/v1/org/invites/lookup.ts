import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/invites/lookup",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const callerMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!callerMember || !hasPermission(callerMember.permissions, OrgPerm.ORG_MEMBERS_MANAGE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to invite members";
      }

      const cleanEmail = body.email.trim().toLowerCase();
      if (!cleanEmail) {
        set.status = "Bad Request";
        return "Email is required";
      }

      const targetUser = await prisma.client.user.findUnique({
        where: { email: cleanEmail },
        select: {
          id: true,
          email: true,
          name: true,
          avatar: true,
          disabledAt: true,
          deletedAt: true,
        },
      });

      if (!targetUser || targetUser.disabledAt || targetUser.deletedAt) {
        set.status = "Not Found";
        return "No active registered user found with this email";
      }

      const alreadyMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: targetUser.id } },
      });

      if (alreadyMember && !alreadyMember.isDeleted) {
        set.status = "Conflict";
        return "User is already a member of this organization";
      }

      return {
        id: String(targetUser.id),
        email: targetUser.email,
        name: targetUser.name,
        avatar: targetUser.avatar,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Lookup registered user by email before inviting",
        description: "Checks whether a registered, active user exists for the specified email and is not already a member.",
      },
      body: t.Object({
        email: t.String({ minLength: 3, maxLength: 256 }),
      }),
      response: {
        200: t.Object({
          id: t.String(),
          email: t.String(),
          name: t.Nullable(t.String()),
          avatar: t.Nullable(t.String()),
        }),
        400: t.String(),
        403: t.String(),
        404: t.String(),
        409: t.String(),
      },
    },
  );

export default endpoint;
