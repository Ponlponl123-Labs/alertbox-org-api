import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/accept",
    async ({ getAuthenticatedUser, body, set }) => {
      const user = await getAuthenticatedUser({ id: true, email: true });
      const code = String(body.code ?? "").trim();
      if (!code) {
        set.status = "Bad Request";
        return "Invitation code is required";
      }

      const invite = await prisma.client.organizationInvite.findFirst({
        where: {
          token: code,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
        include: { organization: true },
        orderBy: { createdAt: "desc" },
      });

      if (!invite) {
        set.status = "Bad Request";
        return "Invitation code is invalid or has expired";
      }

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

      // Add member and mark invite accepted in transaction
      await prisma.client.$transaction([
        prisma.client.organizationMember.upsert({
          where: { orgId_userId: { orgId: invite.orgId, userId: user.data.id } },
          create: {
            orgId: invite.orgId,
            userId: user.data.id,
            role: invite.role,
            permissions: invite.permissions,
          },
          update: {
            role: invite.role,
            permissions: invite.permissions,
          },
        }),
        prisma.client.organizationInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        }),
      ]);

      await Promise.all([
        redis.redis.del(`user:${String(user.data.id)}:orgs`),
        redis.redis.del(`user:${String(user.data.id)}:org_list`),
        redis.redis.del(`org:${String(invite.orgId)}:members`),
      ]);

      return {
        orgId: String(invite.orgId),
        orgName: invite.organization.name,
        orgSlug: invite.organization.slug,
        role: invite.role,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Accept organization invite via code",
        description: "Confirms 8-digit OTP code and joins the organization.",
      },
      body: t.Object({
        code: t.String(),
      }),
    },
  )
  .post(
    "/:token/accept",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser({ id: true, email: true });
      const token = params.token.trim();

      const invite = await prisma.client.organizationInvite.findUnique({
        where: { token },
        include: { organization: true },
      });

      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        set.status = "Bad Request";
        return "Invite is invalid or expired";
      }

      if (invite.email.toLowerCase() !== user.data.email.toLowerCase()) {
        set.status = "Forbidden";
        return "This invitation was issued to a different email address";
      }

      await prisma.client.$transaction([
        prisma.client.organizationMember.upsert({
          where: { orgId_userId: { orgId: invite.orgId, userId: user.data.id } },
          create: {
            orgId: invite.orgId,
            userId: user.data.id,
            role: invite.role,
            permissions: invite.permissions,
          },
          update: {
            role: invite.role,
            permissions: invite.permissions,
          },
        }),
        prisma.client.organizationInvite.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        }),
      ]);

      await Promise.all([
        redis.redis.del(`user:${String(user.data.id)}:orgs`),
        redis.redis.del(`user:${String(user.data.id)}:org_list`),
        redis.redis.del(`org:${String(invite.orgId)}:members`),
      ]);

      return {
        orgId: String(invite.orgId),
        orgName: invite.organization.name,
        orgSlug: invite.organization.slug,
        role: invite.role,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Accept organization invite via link token",
        description: "Accepts an invitation to join an organization via token.",
      },
    },
  );

export default endpoint;
