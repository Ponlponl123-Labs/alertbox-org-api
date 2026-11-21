import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
import { resolveOrgId } from "@/core/org";
import {
  orgParamsSchema,
  orgInviteSummarySchema,
  standardOrgErrors,
} from "../schemas";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/invites",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const callerMember = await db
        .selectFrom("OrganizationMember")
        .select(["permissions"])
        .where("orgId", "=", Number(orgId))
        .where("userId", "=", Number(user.data.id))
        .executeTakeFirst();

      if (!callerMember || !hasPermission(BigInt(callerMember.permissions), OrgPerm.ORG_MEMBER_ADD)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view invites";
      }

      const invites = await db
        .selectFrom("OrganizationInvite")
        .select(["id", "email", "role", "permissions", "token", "expiresAt", "createdAt"])
        .where("orgId", "=", Number(orgId))
        .where("acceptedAt", "is", null)
        .where("expiresAt", ">", new Date())
        .orderBy("createdAt", "desc")
        .execute();

      return invites.map((inv) => ({
        id: String(inv.id),
        email: inv.email,
        role: inv.role,
        permissions: String(inv.permissions),
        token: inv.token,
        code: inv.token,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      }));
    },
    {
      params: orgParamsSchema,
      detail: {
        tags: ["Organization Invites"],
        summary: "List pending organization invites",
        description: "Returns active, unaccepted invitations for the organization.",
      },
      response: {
        200: t.Array(orgInviteSummarySchema, { description: "List of pending unaccepted organization invitations" }),
        ...standardOrgErrors,
      },
    },
  );

export default endpoint;
