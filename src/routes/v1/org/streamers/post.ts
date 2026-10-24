import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { DEFAULT_ALERTBOX_EVENTS } from "@/consts/widget";
import { nanoid } from "nanoid";
import { authorizeOrg, authorizeStreamer } from "@/core/org";
import { isSelfHosted } from "@/utils/instance";
import { logOrgAudit } from "@/core/audit";
import { ChannelNameRegistry } from "@/classes/streamer/channel-name";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/streamers",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.STREAMER_CREATE, set, "create streamer channel");
      if (typeof authRes === "string") return authRes;
      const { orgId } = authRes;

      // Limit community organizations to 1 channel on production; community self-hosted is unlocked
      const orgRecord = await db
        .selectFrom("Organization")
        .select(["type"])
        .where("id", "=", Number(orgId))
        .executeTakeFirst();

      if (!isSelfHosted() && (!orgRecord || orgRecord.type === "COMMUNITY")) {
        const countRow = await db
          .selectFrom("Streamer")
          .select((eb) => eb.fn.count("id").as("count"))
          .where("orgId", "=", Number(orgId))
          .where("deletedAt", "is", null)
          .executeTakeFirst();
        if (Number(countRow?.count ?? 0) >= 1) {
          set.status = "Forbidden";
          return "Community organizations can only create one channel";
        }
      }

      const name = body.name.trim().toLowerCase();
      const availability = await ChannelNameRegistry.checkAvailability(name);

      if (availability.status === "invalid") {
        set.status = "Bad Request";
        return "Channel name can only contain lowercase alphanumeric characters, hyphens, and underscores";
      }

      if (availability.status === "reserved") {
        set.status = "Forbidden";
        return "Channel name is reserved";
      }

      if (availability.status === "taken") {
        set.status = "Conflict";
        return "Channel name already taken";
      }
      const displayName = (body.displayName?.trim() || name).slice(0, 64);
      const timestamp = Date.now();
      const widgetToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;

      const { streamerId, widgetId } = await db.transaction().execute(async (trx) => {
        const streamerRes = await trx
          .insertInto("Streamer")
          .values({
            orgId: Number(orgId),
            name,
            displayName,
            updatedAt: new Date(),
          })
          .executeTakeFirstOrThrow();
        const sId = Number(streamerRes.insertId);

        const widgetRes = await trx
          .insertInto("Widget")
          .values({
            orgId: Number(orgId),
            streamerId: sId,
            type: "ALERTBOX",
            token: widgetToken,
            updatedAt: new Date(),
          })
          .executeTakeFirstOrThrow();
        const wId = Number(widgetRes.insertId);

        const settingRes = await trx
          .insertInto("AlertboxSetting")
          .values({
            widgetId: wId,
          })
          .executeTakeFirstOrThrow();
        const settingId = Number(settingRes.insertId);

        if (DEFAULT_ALERTBOX_EVENTS.length > 0) {
          await trx
            .insertInto("AlertboxEvent")
            .values(
              DEFAULT_ALERTBOX_EVENTS.map((ev) => ({
                alertboxId: settingId,
                eventType: ev.eventType as any,
                prefix: ev.prefix,
                subfix: ev.subfix,
                messageLayout: ev.messageLayout,
                animIn: ev.animIn ?? null,
                animOut: ev.animOut ?? null,
                ttsEnabled: ev.ttsEnabled ? 1 : 0,
                updatedAt: new Date(),
              })),
            )
            .execute();
        }

        return { streamerId: sId, widgetId: wId };
      });

      const streamer = await db
        .selectFrom("Streamer")
        .select(["id", "name", "displayName", "avatar", "uri", "createdAt"])
        .where("id", "=", streamerId)
        .executeTakeFirstOrThrow();

      const members = await db
        .selectFrom("OrganizationMember")
        .select(["userId"])
        .where("orgId", "=", Number(orgId))
        .where("isDeleted", "is", null)
        .execute();

      const keysToDelete = [
        `org:${String(orgId)}:streamers`,
        `org:${String(orgId)}:primary_streamer`,
        `org:${String(orgId)}:members`,
        `uri:${name}:owner`,
        ...members.map((m) => `user:${String(m.userId)}:org_list`),
      ];

      await Promise.all(keysToDelete.map((k) => redis.redis.del(k)));
      await ChannelNameRegistry.claim(name, streamer.id);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "STREAMER_CREATED",
        targetType: "STREAMER",
        targetId: BigInt(streamer.id),
        payload: { name: streamer.name, displayName: streamer.displayName },
      });

      return {
        id: String(streamer.id),
        name: streamer.name,
        displayName: streamer.displayName,
        avatar: streamer.avatar,
        uri: streamer.uri,
        widgets: [
          {
            id: String(widgetId),
            type: "ALERTBOX",
            token: widgetToken,
          },
        ],
        createdAt: streamer.createdAt,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Create streamer channel in organization",
        description: "Provisions a new streamer channel with dedicated AlertBox widget.",
      },
      body: t.Object({
        name: t.String({ pattern: "^[a-z0-9_\\-]+$", minLength: 1, maxLength: 64 }),
        displayName: t.Optional(t.String({ maxLength: 64 })),
      }),
    },
  )
  .post(
    "/:orgId/streamers/:streamerId/publish",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.STREAMER_MANAGE,
          requiredStreamerPerm: StreamerPerm.STREAMER_MANAGE,
          actionDescription: "publish streamer channel",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId, streamerId } = authRes;

      const publishedAt = new Date();
      await db
        .updateTable("Streamer")
        .set({ publishedAt, updatedAt: new Date() })
        .where("id", "=", Number(streamerId))
        .execute();

      await Promise.all([
        redis.redis.del(`streamer:${String(streamerId)}:info`),
        redis.redis.del(`streamer:${String(streamerId)}:profile`),
        redis.redis.del(`org:${String(orgId)}:streamers`),
        redis.redis.del(`org:${String(orgId)}:primary_streamer`),
      ]);

      return { publishedAt };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Publish streamer channel",
        description: "Makes streamer channel public.",
      },
    },
  );

export default endpoint;
