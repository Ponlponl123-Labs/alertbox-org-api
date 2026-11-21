import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { logOrgAudit } from "@/core/audit";
import { updateStreamerCache } from "@/utils/cache-sync";
import {
  streamerParamsSchema,
  okResponseSchema,
  standardErrors,
} from "./schemas";

export const endpoint = new Elysia()
  .use(auth)
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
        .set({ publishedAt, updatedAt: publishedAt })
        .where("id", "=", Number(streamerId))
        .execute();

      const members = await db
        .selectFrom("OrganizationMember")
        .select(["userId"])
        .where("orgId", "=", Number(orgId))
        .where("isDeleted", "is", null)
        .execute();

      await Promise.all([
        updateStreamerCache(
          { id: streamerId, orgId, publishedAt },
          members.map((m) => BigInt(m.userId)),
        ),
        redis.redis.del(`streamer:${String(streamerId)}:public_details`),
        redis.redis.del(`streamer:${String(streamerId)}:info`),
      ]);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "STREAMER_UPDATED",
        targetType: "STREAMER",
        targetId: streamerId,
        payload: {
          streamerId: String(streamerId),
          action: "PUBLISH",
        },
      });

      return { publishedAt: publishedAt.toISOString() };
    },
    {
      params: streamerParamsSchema,
      detail: {
        tags: ["Streamers"],
        summary: "Publish streamer channel",
        description: "Enables public tipping and profile visibility for the channel.",
      },
      response: {
        200: t.Object({
          publishedAt: t.String({ description: "ISO 8601 publication timestamp", examples: ["2026-11-21T12:00:00.000Z"] }),
        }, { description: "Channel publication timestamp" }),
        ...standardErrors,
      },
    },
  )
  .delete(
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
          actionDescription: "unpublish streamer channel",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId, streamerId } = authRes;

      await db
        .updateTable("Streamer")
        .set({ publishedAt: null, updatedAt: new Date() })
        .where("id", "=", Number(streamerId))
        .execute();

      const members = await db
        .selectFrom("OrganizationMember")
        .select(["userId"])
        .where("orgId", "=", Number(orgId))
        .where("isDeleted", "is", null)
        .execute();

      await Promise.all([
        updateStreamerCache(
          { id: streamerId, orgId, publishedAt: null },
          members.map((m) => BigInt(m.userId)),
        ),
        redis.redis.del(`streamer:${String(streamerId)}:public_details`),
        redis.redis.del(`streamer:${String(streamerId)}:info`),
      ]);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "STREAMER_UPDATED",
        targetType: "STREAMER",
        targetId: streamerId,
        payload: {
          streamerId: String(streamerId),
          action: "UNPUBLISH",
        },
      });

      return "OK";
    },
    {
      params: streamerParamsSchema,
      detail: {
        tags: ["Streamers"],
        summary: "Unpublish streamer channel",
        description: "Disables public tipping and profile visibility for the channel.",
      },
      response: {
        200: okResponseSchema,
        ...standardErrors,
      },
    },
  );

export default endpoint;
