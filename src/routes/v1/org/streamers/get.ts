import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId, resolveStreamerId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/streamers",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const member = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!member || !hasPermission(member.permissions, OrgPerm.VIEW_STREAMERS)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view streamers";
      }

      const streamers = await prisma.client.streamer.findMany({
        where: { orgId, deletedAt: null },
        include: {
          widgets: {
            where: { deletedAt: null },
            select: { id: true, type: true, token: true },
          },
        },
        orderBy: { createdAt: "asc" },
      });

      return streamers.map((s) => ({
        id: String(s.id),
        name: s.name,
        displayName: s.displayName,
        avatar: s.avatar,
        uri: s.uri,
        publishedAt: s.publishedAt,
        widgets: s.widgets.map((w) => ({
          ...w,
          id: String(w.id),
        })),
        createdAt: s.createdAt,
      }));
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List streamers in organization",
        description: "Returns all active streamer channels within the organization.",
      },
    },
  )
  .get(
    "/:orgId/streamers/:streamerId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization or streamer ID";
      }
      const streamerId = await resolveStreamerId(orgId, params.streamerId);
      if (!streamerId) {
        set.status = "Bad Request";
        return "Invalid organization or streamer ID";
      }

      const member = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!member || !hasPermission(member.permissions, OrgPerm.VIEW_STREAMERS)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view streamer channel";
      }

      const streamer = await prisma.client.streamer.findFirst({
        where: { id: streamerId, orgId, deletedAt: null },
        include: {
          widgets: {
            where: { deletedAt: null },
            include: {
              alertbox: {
                include: { events: true },
              },
            },
          },
          integration: true,
        },
      });

      if (!streamer) {
        set.status = "Not Found";
        return "Streamer channel not found";
      }

      return {
        id: String(streamer.id),
        orgId: String(streamer.orgId),
        name: streamer.name,
        displayName: streamer.displayName,
        bio: streamer.bio,
        avatar: streamer.avatar,
        banner: streamer.banner,
        uri: streamer.uri,
        uriCooldownEnd: streamer.uriCooldownEnd,
        publishedAt: streamer.publishedAt,
        accentColor: streamer.accentColor,
        twitch: streamer.twitch,
        youtube: streamer.youtube,
        twitter: streamer.twitter,
        facebook: streamer.facebook,
        reddit: streamer.reddit,
        discord: streamer.discord,
        widgets: streamer.widgets.map((w) => ({
          ...w,
          id: String(w.id),
          orgId: String(w.orgId),
          streamerId: String(w.streamerId),
        })),
        integration: streamer.integration
          ? {
              ...streamer.integration,
              id: String(streamer.integration.id),
              orgId: String(streamer.integration.orgId),
              streamerId: String(streamer.integration.streamerId),
            }
          : null,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get streamer channel details",
        description: "Returns full metadata, widgets, and integrations for a specific streamer channel.",
      },
    },
  );

export default endpoint;
