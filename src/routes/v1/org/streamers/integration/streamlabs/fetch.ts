import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { authorizeStreamer } from "@/core/org";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { integrationParamsSchema } from "../common";

export const fetchEndpoint = new Elysia()
  .use(auth)
  .get(
    "/streamlabs",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.INTEGRATION_VIEW,
          requiredStreamerPerm: StreamerPerm.STREAMER_VIEW,
          actionDescription: "view Streamlabs integration",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { streamerId } = authRes;

      const integration = await db
        .selectFrom("Integration")
        .select(["secret", "options"])
        .where("streamerId", "=", Number(streamerId))
        .where("type", "=", "STREAMLABS")
        .where("deletedAt", "is", null)
        .executeTakeFirst();

      return {
        isConnected: Boolean(integration?.secret),
        options: integration?.options ?? null,
      };
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Streamlabs Relay"],
        summary: "Get Streamlabs connection status & options",
        description: "Returns whether Streamlabs is connected for the channel and configured relay options.",
      },
    },
  );

export default fetchEndpoint;
