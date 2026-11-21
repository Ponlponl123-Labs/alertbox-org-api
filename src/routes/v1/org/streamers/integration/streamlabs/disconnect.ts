import Elysia from "elysia";
import { auth } from "@/core/auth";
import { removeConnection } from "@/classes/streamer";
import { logOrgAudit } from "@/core/audit";
import { authorizeIntegrationManage, integrationParamsSchema } from "../common";

export const disconnectEndpoint = new Elysia()
  .use(auth)
  .delete(
    "/streamlabs",
    async ({ getAuthenticatedUser, params, set }) => {
      const { error, ctx, user } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
      );
      if (error) return error;
      const { orgId, streamerId } = ctx!;

      await removeConnection(streamerId, "streamlabs");

      await logOrgAudit({
        orgId,
        userId: user!.data.id,
        action: "INTEGRATION_DISCONNECTED",
        targetType: "STREAMER",
        targetId: BigInt(streamerId),
        payload: {
          streamerId: String(streamerId),
          platform: "streamlabs",
        },
      });

      return "OK";
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Streamlabs Relay"],
        summary: "Disconnect Streamlabs integration",
        description: "Unlinks Streamlabs tokens from streamer channel.",
      },
    },
  );

export default disconnectEndpoint;
