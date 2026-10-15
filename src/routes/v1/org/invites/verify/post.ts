import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";

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

      const invite = await prisma.client.organizationInvite.findFirst({
        where: {
          token: code,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: {
          organization: {
            select: { id: true, name: true, slug: true, avatar: true },
          },
          inviter: {
            select: { name: true, avatar: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (!invite) {
        set.status = "Bad Request";
        return "Invalid or expired invitation code";
      }

      // Verify this is the latest unaccepted invite for this email
      const latestOrgInvite = await prisma.client.organizationInvite.findFirst({
        where: { orgId: invite.orgId, email: invite.email, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
      });

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
          id: String(invite.organization.id),
          name: invite.organization.name,
          slug: invite.organization.slug,
          avatar: invite.organization.avatar,
        },
        inviter: {
          name: invite.inviter.name,
          avatar: invite.inviter.avatar,
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
