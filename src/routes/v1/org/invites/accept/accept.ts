import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
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

      const invite = await db
        .selectFrom("OrganizationInvite")
        .innerJoin("Organization", "Organization.id", "OrganizationInvite.orgId")
        .select([
          "OrganizationInvite.id",
          "OrganizationInvite.orgId",
          "OrganizationInvite.email",
          "OrganizationInvite.role",
          "OrganizationInvite.permissions",
          "Organization.name as orgName",
          "Organization.slug as orgSlug",
        ])
        .where("OrganizationInvite.token", "=", code)
        .where("OrganizationInvite.acceptedAt", "is", null)
        .where("OrganizationInvite.expiresAt", ">", new Date())
        .orderBy("OrganizationInvite.createdAt", "desc")
        .executeTakeFirst();

      if (!invite) {
        set.status = "Bad Request";
        return "Invitation code is invalid or has expired";
      }

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

      // Add member and mark invite accepted in transaction
      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("OrganizationMember")
          .values({
            orgId: Number(invite.orgId),
            userId: Number(user.data.id),
            role: invite.role,
            permissions: BigInt(invite.permissions),
            isDeleted: null,
            updatedAt: new Date(),
          })
          .onDuplicateKeyUpdate({
            role: invite.role,
            permissions: BigInt(invite.permissions),
            isDeleted: null,
            updatedAt: new Date(),
          })
          .execute();

        await trx
          .updateTable("OrganizationInvite")
          .set({ acceptedAt: new Date() })
          .where("id", "=", Number(invite.id))
          .execute();
      });

      await Promise.all([
        redis.redis.del(`user:${String(user.data.id)}:info`),
        redis.redis.del(`user:${String(user.data.id)}:orgs`),
        redis.redis.del(`user:${String(user.data.id)}:org_list`),
        redis.redis.del(`org:${String(invite.orgId)}:members`),
      ]);

      return {
        orgId: String(invite.orgId),
        orgName: invite.orgName,
        orgSlug: invite.orgSlug,
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

      const invite = await db
        .selectFrom("OrganizationInvite")
        .innerJoin("Organization", "Organization.id", "OrganizationInvite.orgId")
        .select([
          "OrganizationInvite.id",
          "OrganizationInvite.orgId",
          "OrganizationInvite.email",
          "OrganizationInvite.role",
          "OrganizationInvite.permissions",
          "OrganizationInvite.acceptedAt",
          "OrganizationInvite.expiresAt",
          "Organization.name as orgName",
          "Organization.slug as orgSlug",
        ])
        .where("OrganizationInvite.token", "=", token)
        .executeTakeFirst();

      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) {
        set.status = "Bad Request";
        return "Invite is invalid or expired";
      }

      if (invite.email.toLowerCase() !== user.data.email.toLowerCase()) {
        set.status = "Forbidden";
        return "This invitation was issued to a different email address";
      }

      await db.transaction().execute(async (trx) => {
        await trx
          .insertInto("OrganizationMember")
          .values({
            orgId: Number(invite.orgId),
            userId: Number(user.data.id),
            role: invite.role,
            permissions: BigInt(invite.permissions),
            isDeleted: null,
            updatedAt: new Date(),
          })
          .onDuplicateKeyUpdate({
            role: invite.role,
            permissions: BigInt(invite.permissions),
            isDeleted: null,
            updatedAt: new Date(),
          })
          .execute();

        await trx
          .updateTable("OrganizationInvite")
          .set({ acceptedAt: new Date() })
          .where("id", "=", Number(invite.id))
          .execute();
      });

      await Promise.all([
        redis.redis.del(`user:${String(user.data.id)}:info`),
        redis.redis.del(`user:${String(user.data.id)}:orgs`),
        redis.redis.del(`user:${String(user.data.id)}:org_list`),
        redis.redis.del(`org:${String(invite.orgId)}:members`),
      ]);

      return {
        orgId: String(invite.orgId),
        orgName: invite.orgName,
        orgSlug: invite.orgSlug,
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
