import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { day } from "@/consts/time";

export const listOrgsEndpoint = new Elysia()
  .use(auth)
  .get(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser();
      const cacheKey = `user:${String(user.data.id)}:org_list`;
      const cached = await redis.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }

      const memberships = await prisma.client.organizationMember.findMany({
        where: { userId: user.data.id, organization: { deletedAt: null } },
        include: {
          organization: {
            include: {
              _count: { select: { members: true, streamers: true } },
              streamers: {
                where: { deletedAt: null },
                select: {
                  id: true,
                  name: true,
                  displayName: true,
                  avatar: true,
                  uri: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      const result = memberships.map((m) => {
        const org = m.organization;
        // write-through centralized org info
        const orgInfo = {
          id: String(org.id),
          type: org.type,
          name: org.name,
          slug: org.slug,
          avatar: org.avatar,
          banner: org.banner,
          ownerId: String(org.ownerId),
          createdAt: org.createdAt,
        };
        void redis.redis.setex(`org:${String(org.id)}:info`, day, JSON.stringify(orgInfo)).catch(() => {});

        return {
          id: String(org.id),
          type: org.type,
          name: org.name,
          slug: org.slug,
          avatar: org.avatar,
          banner: org.banner,
          role: m.role,
          permissions: m.permissions.toString(),
          memberCount: org._count.members,
          streamers: org.streamers.map((s) => ({
            ...s,
            id: String(s.id),
          })),
          joinedAt: m.createdAt,
        };
      });

      await redis.redis.setex(cacheKey, 3600, JSON.stringify(result));
      return result;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List user organizations",
        description: "Returns all organizations where the user is an active member or owner.",
      },
      response: {
        200: t.Array(
          t.Object({
            id: t.String(),
            type: t.String(),
            name: t.String(),
            slug: t.String(),
            avatar: t.Nullable(t.String()),
            banner: t.Nullable(t.String()),
            role: t.String(),
            permissions: t.String(),
            memberCount: t.Number(),
            streamers: t.Array(
              t.Object({
                id: t.String(),
                name: t.String(),
                displayName: t.String(),
                avatar: t.Nullable(t.String()),
                uri: t.Nullable(t.String()),
              }),
            ),
            joinedAt: t.Date(),
          }),
        ),
      },
    },
  );

export default listOrgsEndpoint;
