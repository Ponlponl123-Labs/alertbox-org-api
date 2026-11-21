import Elysia from "elysia";
import { auth } from "@/core/auth";
import { resolveProvider, removeConnection } from "@/classes/streamer";
import { logOrgAudit } from "@/core/audit";
import { authorizeIntegrationManage, integrationProviderParamsSchema } from "./common";

export const disconnectEndpoint = new Elysia()
  .use(auth)
  .delete(
    "/:provider",
    async ({ getAuthenticatedUser, params, set }) => {
      const { error, ctx, user } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
      );
      if (error) return error;
      const { orgId, streamerId } = ctx!;

      const provider = resolveProvider(params.provider ?? "");
      if (!provider) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      await removeConnection(streamerId, provider);

      await logOrgAudit({
        orgId,
        userId: user!.data.id,
        action: "INTEGRATION_DISCONNECTED",
        targetType: "STREAMER",
        targetId: BigInt(streamerId),
        payload: {
          streamerId: String(streamerId),
          platform: provider,
        },
      });

      return "OK";
    },
    {
      params: integrationProviderParamsSchema,
      detail: {
        tags: ["Organizations"],
        summary: "Remove streamer channel connection",
        description: "Unlinks payment provider credentials from a streamer channel.",
      },
    },
  );

export default disconnectEndpoint;
