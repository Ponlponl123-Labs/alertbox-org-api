import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db, OrgRole, OrgType } from "@/db";
import { redis } from "@/core/redis";
import { nanoid } from "nanoid";
import { OrgPerm } from "@/consts/permission";
import { pureUserSelect } from "@/consts/session";
import { isSelfHosted } from "@/utils/instance";

export const createOrgEndpoint = new Elysia()
  .use(auth)
  .post(
    "/",
    async ({ getAuthenticatedUser, body, set }) => {
      const user = await getAuthenticatedUser(pureUserSelect);
      const userType = user.data.type || "REGULAR";

      // Limit regular and supporter users to 1 active owned organization on production; community self-hosted is unlocked
      if (!isSelfHosted() && userType !== "OPERATOR") {
        const activeOwnedCountRow = await db
          .selectFrom("OrganizationMember")
          .innerJoin("Organization", "Organization.id", "OrganizationMember.orgId")
          .select((eb) => eb.fn.count("OrganizationMember.id").as("count"))
          .where("OrganizationMember.userId", "=", Number(user.data.id))
          .where("OrganizationMember.role", "=", "OWNER")
          .where("OrganizationMember.isDeleted", "is", null)
          .where("Organization.deletedAt", "is", null)
          .executeTakeFirst();
        const activeOwnedCount = Number(activeOwnedCountRow?.count ?? 0);
        if (activeOwnedCount >= 1) {
          set.status = "Forbidden";
          return "Regular and supporter accounts can only create one organization";
        }
      }

      const name = body.name.trim();
      const slug = (
        body.slug?.trim().toLowerCase() ||
        `${name.toLowerCase().replace(/[^a-z0-9]/g, "") || "org"}-${nanoid(6)}`
      ).slice(0, 50);

      // Check slug uniqueness
      const existing = await db
        .selectFrom("Organization")
        .select("id")
        .where("slug", "=", slug)
        .executeTakeFirst();

      if (existing) {
        set.status = "Conflict";
        return "Organization slug already in use";
      }

      const orgType = (userType === "OPERATOR" && body.type === "ENTERPRISE") ? "ENTERPRISE" : "COMMUNITY";

      const createdOrg = await db.transaction().execute(async (trx) => {
        const insertRes = await trx
          .insertInto("Organization")
          .values({
            ownerId: Number(user.data.id),
            createBy: Number(user.data.id),
            type: orgType,
            name,
            slug,
            updatedAt: new Date(),
          })
          .executeTakeFirstOrThrow();

        const orgId = Number(insertRes.insertId);

        await trx
          .insertInto("OrganizationMember")
          .values({
            orgId,
            userId: Number(user.data.id),
            role: "OWNER",
            permissions: Number(OrgPerm.ALL),
            updatedAt: new Date(),
          })
          .execute();

        return { id: orgId, type: orgType, name, slug };
      });

      // Invalidate user orgs cache
      await Promise.all([
        redis.redis.del(`user:${String(user.data.id)}:orgs`),
        redis.redis.del(`user:${String(user.data.id)}:org_list`),
      ]);

      return {
        id: String(createdOrg.id),
        type: createdOrg.type,
        name: createdOrg.name,
        slug: createdOrg.slug,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Create a new organization",
        description:
          "Creates an organization and assigns caller as OWNER with full permissions.",
      },
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 100 }),
        type: t.Optional(t.Enum(OrgType)),
        slug: t.Optional(
          t.String({ pattern: "^[a-z0-9_-]+$", minLength: 2, maxLength: 50 }),
        ),
      }),
      response: {
        200: t.Object({
          id: t.String(),
          type: t.String(),
          name: t.String(),
          slug: t.String(),
          streamerId: t.Optional(t.String()),
        }),
        409: t.String(),
      },
    },
  );

export default createOrgEndpoint;
