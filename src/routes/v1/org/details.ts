import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { resolveOrgId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const member = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
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
                  publishedAt: true,
                },
              },
            },
          },
        },
      });

      if (!member || member.organization.deletedAt) {
        set.status = "Not Found";
        return "Organization not found";
      }

      return {
        id: String(member.organization.id),
        name: member.organization.name,
        slug: member.organization.slug,
        avatar: member.organization.avatar,
        banner: member.organization.banner,
        role: member.role,
        permissions: member.permissions.toString(),
        memberCount: member.organization._count.members,
        streamers: member.organization.streamers.map((s) => ({
          ...s,
          id: String(s.id),
        })),
        createdAt: member.organization.createdAt,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get organization details",
        description: "Retrieves details of an organization if the user is a member.",
      },
    },
  );

export default endpoint;
