import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer, resolveOrgId } from "@/core/org";

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

      const callerMember = await db
        .selectFrom("OrganizationMember")
        .select(["id", "permissions", "role"])
        .where("orgId", "=", Number(orgId))
        .where("userId", "=", Number(user.data.id))
        .executeTakeFirst();

      if (!callerMember) {
        set.status = "Forbidden";
        return "Insufficient permissions to view streamers";
      }

      const isOwnerOrAdmin = callerMember.role === "OWNER" || callerMember.role === "ADMIN";
      const hasOrgViewStreamers = isOwnerOrAdmin || hasPermission(BigInt(callerMember.permissions), OrgPerm.STREAMER_VIEW);

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
        const streamers = await db
          .selectFrom("Streamer")
          .select(["id", "name", "displayName", "avatar", "uri", "publishedAt", "createdAt"])
          .where("orgId", "=", Number(orgId))
          .where("deletedAt", "is", null)
          .orderBy("createdAt", "asc")
          .execute();

        const streamerIds = streamers.map((s) => s.id);
        const widgets = streamerIds.length
          ? await db
              .selectFrom("Widget")
              .select(["id", "streamerId", "type", "token"])
              .where("streamerId", "in", streamerIds)
              .where("deletedAt", "is", null)
              .execute()
          : [];

        const widgetsByStreamer = new Map<string, typeof widgets>();
        for (const w of widgets) {
          const key = String(w.streamerId);
          const list = widgetsByStreamer.get(key) || [];
          list.push(w);
          widgetsByStreamer.set(key, list);
        }

        streamersData = streamers.map((s) => ({
          id: String(s.id),
          name: s.name,
          displayName: s.displayName,
          avatar: s.avatar,
          uri: s.uri,
          publishedAt: s.publishedAt,
          widgets: (widgetsByStreamer.get(String(s.id)) || []).map((w) => ({
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

      const streamer = await db
        .selectFrom("Streamer")
        .select([
          "id",
          "orgId",
          "name",
          "displayName",
          "bio",
          "avatar",
          "banner",
          "uri",
          "uriCooldownEnd",
          "publishedAt",
          "accentColor",
          "twitch",
          "youtube",
          "twitter",
          "facebook",
          "reddit",
          "discord",
        ])
        .where("id", "=", Number(streamerId))
        .where("orgId", "=", Number(orgId))
        .where("deletedAt", "is", null)
        .executeTakeFirst();

      if (!streamer) {
        set.status = "Not Found";
        return "Streamer channel not found";
      }

      const [widgets, integration] = await Promise.all([
        db.selectFrom("Widget")
          .select(["id", "orgId", "streamerId", "type", "token", "createdAt", "updatedAt"])
          .where("streamerId", "=", Number(streamerId))
          .where("deletedAt", "is", null)
          .execute(),
        db.selectFrom("Integration")
          .select([
            "id",
            "orgId",
            "streamerId",
            "stripeSecret",
            "bmacSecret",
            "kofiSecret",
            "xenditSecret",
            "ffpSecret",
            "streamlabsSecret",
            "kofiUsername",
            "bmacUsername",
          ])
          .where("streamerId", "=", Number(streamerId))
          .executeTakeFirst(),
      ]);

      const widgetIds = widgets.map((w) => w.id);
      const alertboxSettings = widgetIds.length
        ? await db
            .selectFrom("AlertboxSetting")
            .selectAll()
            .where("widgetId", "in", widgetIds)
            .execute()
        : [];

      const alertboxIds = alertboxSettings.map((a) => a.id);
      const alertEvents = alertboxIds.length
        ? await db
            .selectFrom("AlertboxEvent")
            .selectAll()
            .where("alertboxId", "in", alertboxIds)
            .execute()
        : [];

      const eventsByAlertbox = new Map<string, typeof alertEvents>();
      for (const ev of alertEvents) {
        const key = String(ev.alertboxId);
        const list = eventsByAlertbox.get(key) || [];
        list.push(ev);
        eventsByAlertbox.set(key, list);
      }

      const alertboxByWidget = new Map<string, typeof alertboxSettings[0] & { events: typeof alertEvents }>();
      for (const setting of alertboxSettings) {
        alertboxByWidget.set(String(setting.widgetId), {
          ...setting,
          events: eventsByAlertbox.get(String(setting.id)) || [],
        });
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
        widgets: widgets.map((w) => {
          const setting = alertboxByWidget.get(String(w.id));
          return {
            ...w,
            id: String(w.id),
            orgId: String(w.orgId),
            streamerId: String(w.streamerId),
            alertbox: setting
              ? {
                  ...setting,
                  id: String(setting.id),
                  widgetId: String(setting.widgetId),
                  events: setting.events.map((ev) => ({
                    ...ev,
                    id: String(ev.id),
                    alertboxId: String(ev.alertboxId),
                  })),
                }
              : null,
          };
        }),
        integration: integration
          ? {
              id: String(integration.id),
              orgId: String(integration.orgId),
              streamerId: String(integration.streamerId),
              stripe: !!integration.stripeSecret,
              bmac: !!integration.bmacSecret,
              kofi: !!integration.kofiSecret,
              xendit: !!integration.xenditSecret,
              ffp: !!integration.ffpSecret,
              streamlabs: !!integration.streamlabsSecret,
              kofiUsername: integration.kofiUsername,
              bmacUsername: integration.bmacUsername,
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
