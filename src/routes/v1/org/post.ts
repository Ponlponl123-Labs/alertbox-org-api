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

      let createdOrg: { id: number; type: string; name: string; slug: string };
      try {
        createdOrg = await db.transaction().execute(async (trx) => {
          // Lock user record to prevent concurrent organization creation race condition
          await trx
            .selectFrom("User")
            .select("id")
            .where("id", "=", Number(user.data.id))
            .forUpdate()
            .executeTakeFirst();

          // Limit regular and supporter users to 1 active owned organization on production; community self-hosted is unlocked
          if (!isSelfHosted() && userType !== "OPERATOR") {
            const activeOwnedCountRow = await trx
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
              throw new Error("LIMIT_EXCEEDED");
            }
          }

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
              permissions: OrgPerm.ALL,
              updatedAt: new Date(),
            })
            .execute();

          return { id: orgId, type: orgType, name, slug };
        });
      } catch (err: any) {
        if (err?.message === "LIMIT_EXCEEDED") {
          set.status = "Forbidden";
          return "Regular and supporter accounts can only create one organization";
        }
        throw err;
      }

      // Invalidate user cache (info, orgs, org_list)
      await Promise.all([
        redis.redis.del(`user:${String(user.data.id)}:info`),
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
        summary: "Create an organization",
        description:
          "Creates a new organization owned by the caller. Automatically sets caller as OWNER and provisions the first channel and alertbox widget.",
      },
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 100 }),
        slug: t.Optional(
          t.String({
            minLength: 2,
            maxLength: 50,
            pattern: "^[a-z0-9-]+$",
          }),
        ),
        type: t.Optional(t.Enum(OrgType)),
      }),
      response: {
        200: t.Object({
          id: t.String(),
          type: t.String(),
          name: t.String(),
          slug: t.String(),
        }),
        400: t.String(),
        403: t.String(),
        409: t.String(),
      },
    },
  );

export default createOrgEndpoint;
