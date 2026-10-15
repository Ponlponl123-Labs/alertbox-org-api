import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { resolveOrgId } from "@/core/org";
import { day } from "@/consts/time";

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

      const orgKey = `org:${String(orgId)}:info`;
      const streamersKey = `org:${String(orgId)}:streamers`;
      const userOrgsKey = `user:${String(user.data.id)}:orgs`;

      const [cachedOrg, cachedStreamers, cachedMemberPerms] = await Promise.all([
        redis.redis.get(orgKey),
        redis.redis.get(streamersKey),
        redis.redis.hget(userOrgsKey, String(orgId)),
      ]);

      if (cachedOrg && cachedStreamers && cachedMemberPerms) {
        try {
          const org = JSON.parse(cachedOrg);
          const streamers = JSON.parse(cachedStreamers);
          const [role, permissions] = cachedMemberPerms.split(":");
          return {
            id: String(org.id),
            name: org.name,
            slug: org.slug,
            avatar: org.avatar,
            banner: org.banner,
            role,
            permissions,
            memberCount: org.memberCount ?? streamers.length,
            streamers,
            createdAt: org.createdAt,
          };
        } catch {}
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

      const orgInfo = {
        id: String(member.organization.id),
        name: member.organization.name,
        slug: member.organization.slug,
        avatar: member.organization.avatar,
        banner: member.organization.banner,
        ownerId: String(member.organization.ownerId),
        memberCount: member.organization._count.members,
        createdAt: member.organization.createdAt,
      };

      const streamerList = member.organization.streamers.map((s) => ({
        ...s,
        id: String(s.id),
      }));

      await Promise.all([
        redis.redis.setex(orgKey, day, JSON.stringify(orgInfo)),
        redis.redis.setex(streamersKey, 3600, JSON.stringify(streamerList)),
        redis.redis.hset(userOrgsKey, String(orgId), `${member.role}:${member.permissions.toString()}`),
      ]);

      return {
        id: String(member.organization.id),
        name: member.organization.name,
        slug: member.organization.slug,
        avatar: member.organization.avatar,
        banner: member.organization.banner,
        role: member.role,
        permissions: member.permissions.toString(),
        memberCount: member.organization._count.members,
        streamers: streamerList,
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
