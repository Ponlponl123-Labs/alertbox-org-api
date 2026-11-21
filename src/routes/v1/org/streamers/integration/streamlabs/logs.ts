import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { authorizeStreamer } from "@/core/org";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { integrationParamsSchema } from "../common";
import { standardErrors } from "../../schemas";

export const logsEndpoint = new Elysia()
  .use(auth)
  .get(
    "/streamlabs/logs",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.INTEGRATION_VIEW,
          requiredStreamerPerm: StreamerPerm.STREAMER_VIEW,
          actionDescription: "view Streamlabs relay logs",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { streamerId } = authRes;

      const cacheKey = `redis:streamlabs-relay-logs:${streamerId}`;
      const cached = await redis.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      const logs = await db
        .selectFrom("StreamlabsRelayLog")
        .selectAll()
        .where("streamerId", "=", Number(streamerId))
        .orderBy("createdAt", "desc")
        .limit(100)
        .execute();

      const formattedLogs = logs.map((l) => ({
        ...l,
        id: String(l.id),
        orgId: String(l.orgId),
        streamerId: String(l.streamerId),
      }));

      await redis.redis.set(cacheKey, JSON.stringify(formattedLogs), "EX", 60);

      return formattedLogs;
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Streamlabs Relay"],
        summary: "Get Streamlabs relay audit logs",
        description: "Fetches recent donation relay events for the streamer channel cached in Redis for 60 seconds.",
      },
      response: {
        200: t.Array(
          t.Object({
            id: t.String({ description: "Log record ID" }),
            orgId: t.String({ description: "Organization ID" }),
            streamerId: t.String({ description: "Streamer ID" }),
          }, { additionalProperties: true }),
          { description: "Array of recent relay event logs" },
        ),
        ...standardErrors,
      },
    },
  );

export default logsEndpoint;
