import Elysia from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { resolveProvider, removeConnection } from "@/classes/streamer";
import { logOrgAudit } from "@/core/audit";

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
      const { orgId, streamerId } = authRes;

      const provider = resolveProvider(params.provider ?? "");
      if (!provider) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      await removeConnection(streamerId, provider);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "INTEGRATION_DISCONNECTED",
        targetType: "STREAMER",
        targetId: streamerId,
        payload: {
          streamerId: String(streamerId),
          platform: provider,
        },
      });

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
