import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/verify",
    async ({ getAuthenticatedUser, body, set }) => {
      const user = await getAuthenticatedUser({ id: true, email: true });
      const code = String(body.code ?? "").trim();
      if (!code || code.length !== 8) {
        set.status = "Bad Request";
        return "Invalid 8-digit invitation code";
      }

      const invite = await db
        .selectFrom("OrganizationInvite")
        .innerJoin("Organization", "Organization.id", "OrganizationInvite.orgId")
        .innerJoin("User as inviter", "inviter.id", "OrganizationInvite.inviterId")
        .select([
          "OrganizationInvite.id",
          "OrganizationInvite.orgId",
          "OrganizationInvite.token",
          "OrganizationInvite.email",
          "OrganizationInvite.role",
          "OrganizationInvite.expiresAt",
          "Organization.id as orgIdVal",
          "Organization.name as orgName",
          "Organization.slug as orgSlug",
          "Organization.avatar as orgAvatar",
          "Organization.banner as orgBanner",
          "inviter.name as inviterName",
          "inviter.avatar as inviterAvatar",
        ])
        .where("OrganizationInvite.token", "=", code)
        .where("OrganizationInvite.acceptedAt", "is", null)
        .where("OrganizationInvite.expiresAt", ">", new Date())
        .orderBy("OrganizationInvite.createdAt", "desc")
        .executeTakeFirst();

      if (!invite) {
        set.status = "Bad Request";
        return "Invalid or expired invitation code";
      }

      // Verify this is the latest unaccepted invite for this email
      const latestOrgInvite = await db
        .selectFrom("OrganizationInvite")
        .select(["id"])
        .where("orgId", "=", Number(invite.orgId))
        .where("email", "=", invite.email)
        .where("acceptedAt", "is", null)
        .where("expiresAt", ">", new Date())
        .orderBy("createdAt", "desc")
        .executeTakeFirst();

      if (!latestOrgInvite || latestOrgInvite.id !== invite.id) {
        set.status = "Bad Request";
        return "This invitation code has been replaced by a newer code";
      }

      if (invite.email.toLowerCase() !== user.data.email.toLowerCase()) {
        set.status = "Forbidden";
        return "This invitation code was issued to a different email address";
      }

      return {
        code: invite.token,
        role: invite.role,
        expiresAt: invite.expiresAt,
        organization: {
          id: String(invite.orgIdVal),
          name: invite.orgName,
          slug: invite.orgSlug,
          avatar: invite.orgAvatar,
          banner: invite.orgBanner,
        },
        inviter: {
          name: invite.inviterName,
          avatar: invite.inviterAvatar,
        },
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Verify invitation code",
        description: "Validates 8-digit code and returns organization info for confirmation.",
      },
      body: t.Object({
        code: t.String(),
      }),
    },
  );

export default endpoint;
