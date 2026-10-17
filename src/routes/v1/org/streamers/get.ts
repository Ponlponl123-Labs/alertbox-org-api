import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeOrg, authorizeStreamer, resolveOrgId } from "@/core/org";

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

      const callerMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
        select: { id: true, permissions: true, role: true },
      });

      if (!callerMember) {
        set.status = "Forbidden";
        return "Insufficient permissions to view streamers";
      }

      const isOwnerOrAdmin = callerMember.role === "OWNER" || callerMember.role === "ADMIN";
      const hasOrgViewStreamers = isOwnerOrAdmin || hasPermission(callerMember.permissions, OrgPerm.STREAMER_VIEW);

      let assignedStreamerIds: string[] = [];
      if (!isOwnerOrAdmin) {
        const cached = await redis.redis.get(`org:${String(orgId)}:member:${String(callerMember.id)}:streamers`);
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            assignedStreamerIds = parsed.map((a: any) => String(a.streamerId));
          } catch {}
        }
      }

      if (!hasOrgViewStreamers && assignedStreamerIds.length === 0) {
        set.status = "Forbidden";
        return "Insufficient permissions to view streamers";
      }

      const cacheKey = `org:${String(orgId)}:streamers`;
      let streamersData: any[] = [];
      try {
        const cachedVals = await redis.redis.hvals(cacheKey);
        if (cachedVals && cachedVals.length > 0) {
          try {
            streamersData = cachedVals.map((v) => JSON.parse(v));
          } catch {}
        }
      } catch (err: any) {
        if (err?.message?.includes("WRONGTYPE")) {
          await redis.redis.del(cacheKey).catch(() => {});
        }
      }

      if (!streamersData.length) {
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

        streamersData = streamers.map((s) => ({
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

        if (streamersData.length > 0) {
          const map: Record<string, string> = {};
          for (const s of streamersData) {
            map[s.id] = JSON.stringify(s);
          }
          try {
            await redis.redis.hset(cacheKey, map);
          } catch (err: any) {
            if (err?.message?.includes("WRONGTYPE")) {
              await redis.redis.del(cacheKey).catch(() => {});
              await redis.redis.hset(cacheKey, map).catch(() => {});
            }
          }
          await redis.redis.expire(cacheKey, 3600).catch(() => {});
        }
      }

      return hasOrgViewStreamers
        ? streamersData
        : streamersData.filter((s) => assignedStreamerIds.includes(String(s.id)));
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
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.STREAMER_VIEW,
          requiredStreamerPerm: StreamerPerm.STREAMER_VIEW,
          actionDescription: "view streamer channel",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId, streamerId } = authRes;

      const cacheKey = `streamer:${String(streamerId)}:info`;
      const cached = await redis.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
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

      const result = {
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
          alertbox: w.alertbox
            ? {
                ...w.alertbox,
                id: String(w.alertbox.id),
                widgetId: String(w.alertbox.widgetId),
                events: (w.alertbox.events || []).map((ev) => ({
                  ...ev,
                  id: String(ev.id),
                  alertboxId: String(ev.alertboxId),
                })),
              }
            : null,
        })),
        integration: streamer.integration
          ? {
              id: String(streamer.integration.id),
              orgId: String(streamer.integration.orgId),
              streamerId: String(streamer.integration.streamerId),
              stripe: !!streamer.integration.stripeSecret,
              bmac: !!streamer.integration.bmacSecret,
              kofi: !!streamer.integration.kofiSecret,
              xendit: !!streamer.integration.xenditSecret,
              ffp: !!streamer.integration.ffpSecret,
              streamlabs: !!streamer.integration.streamlabsSecret,
              kofiUsername: streamer.integration.kofiUsername,
              bmacUsername: streamer.integration.bmacUsername,
            }
          : null,
      };

      await redis.redis.setex(cacheKey, 3600, JSON.stringify(result));
      return result;
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
