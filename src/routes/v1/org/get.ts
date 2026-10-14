import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";

export const listOrgsEndpoint = new Elysia()
  .use(auth)
  .get(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser();
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

      return memberships.map((m) => ({
        id: String(m.organization.id),
        name: m.organization.name,
        slug: m.organization.slug,
        avatar: m.organization.avatar,
        banner: m.organization.banner,
        role: m.role,
        permissions: m.permissions.toString(),
        memberCount: m.organization._count.members,
        streamers: m.organization.streamers.map((s) => ({
          ...s,
          id: String(s.id),
        })),
        joinedAt: m.createdAt,
      }));
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
