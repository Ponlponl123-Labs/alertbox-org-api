import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { resolveProvider, removeConnection } from "@/classes/streamer";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/streamers/:streamerId/connections/:provider",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.INTEGRATION_MANAGE,
          requiredStreamerPerm: StreamerPerm.STREAMER_INTEGRATION_MANAGE,
          actionDescription: "manage integrations",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { streamerId } = authRes;

      const provider = resolveProvider(params.provider ?? "");
      if (!provider) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      await removeConnection(streamerId, provider);
      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Remove streamer channel connection",
        description: "Unlinks payment provider credentials from a streamer channel.",
      },
    },
  );

export default endpoint;
