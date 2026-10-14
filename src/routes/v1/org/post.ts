import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { nanoid } from "nanoid";
import { OrgPerm } from "@/utils/rbac";
import { DEFAULT_ALERTBOX_EVENTS } from "@/consts/widget";

export const createOrgEndpoint = new Elysia()
  .use(auth)
  .post(
    "/",
    async ({ getAuthenticatedUser, body, set }) => {
      const user = await getAuthenticatedUser();
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

      const timestamp = Date.now();
      const widgetToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;

      const created = await prisma.client.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            ownerId: user.data.id,
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

        const streamer = await tx.streamer.create({
          data: {
            orgId: org.id,
            name,
            displayName: name,
            widgets: {
              create: {
                orgId: org.id,
                type: "ALERTBOX",
                token: widgetToken,
                alertbox: {
                  create: {
                    events: {
                      createMany: {
                        data: DEFAULT_ALERTBOX_EVENTS,
                      },
                    },
                  },
                },
              },
            },
            integration: {
              create: {
                orgId: org.id,
              },
            },
          },
        });

        return { org, streamer };
      });

      // Invalidate user orgs cache
      await redis.redis.del(`user:${String(user.data.id)}:orgs`);

      return {
        id: String(created.org.id),
        name: created.org.name,
        slug: created.org.slug,
        streamerId: String(created.streamer.id),
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Create a new organization",
        description:
          "Creates an organization, assigns caller as OWNER with full permissions, and provisions the default streamer channel and alertbox widget.",
      },
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 100 }),
        slug: t.Optional(
          t.String({ pattern: "^[a-z0-9_-]+$", minLength: 2, maxLength: 50 }),
        ),
      }),
      response: {
        200: t.Object({
          id: t.String(),
          name: t.String(),
          slug: t.String(),
          streamerId: t.String(),
        }),
        409: t.String(),
      },
    },
  );

export default createOrgEndpoint;
