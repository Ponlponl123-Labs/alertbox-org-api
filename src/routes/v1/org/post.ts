import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { nanoid } from "nanoid";
import { OrgPerm } from "@/utils/rbac";
import { pureUserSelect } from "@/consts/session";
import { OrgRole, OrgType } from "@/generated/prisma/client";
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
        const activeOwnedCount = await prisma.client.organizationMember.count({
          where: {
            userId: user.data.id,
            role: OrgRole.OWNER,
            isDeleted: null,
            organization: { deletedAt: null },
          },
        });
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
      const existing = await prisma.client.organization.findUnique({
        where: { slug },
        select: { id: true },
      });

      if (existing) {
        set.status = "Conflict";
        return "Organization slug already in use";
      }

      const orgType = (userType === "OPERATOR" && body.type === "ENTERPRISE") ? "ENTERPRISE" : "COMMUNITY";

      const createdOrg = await prisma.client.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            ownerId: user.data.id,
            createBy: user.data.id,
            type: orgType,
            name,
            slug,
            members: {
              create: {
                userId: user.data.id,
                role: "OWNER",
                permissions: OrgPerm.ALL,
              },
            },
          },
        });

        return org;
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
