import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { resolveProvider, setConnectionDisabled } from "@/classes/streamer";
import { logOrgAudit } from "@/core/audit";
import { authorizeIntegrationManage, integrationProviderParamsSchema } from "./common";
import { okResponseSchema, standardErrors } from "../schemas";

export const toggleEndpoint = new Elysia()
  .use(auth)
  .patch(
    "/:provider",
    async ({ getAuthenticatedUser, params, body, set }) => {
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

      const disabled = Boolean(body.disabled);
      await setConnectionDisabled(streamerId, provider, disabled);

      await logOrgAudit({
        orgId,
        userId: user!.data.id,
        action: disabled ? "INTEGRATION_DISABLED" : "INTEGRATION_ENABLED",
        targetType: "STREAMER",
        targetId: BigInt(streamerId),
        payload: {
          streamerId: String(streamerId),
          platform: provider,
          disabled,
        },
      });

      return "OK";
    },
    {
      params: integrationProviderParamsSchema,
      detail: {
        tags: ["Streamer Integrations"],
        summary: "Toggle streamer channel connection status",
        description: "Enables or disables an integration without deleting its credentials using disabledAt.",
      },
      body: t.Object({
        disabled: t.Boolean({ description: "True to disable the integration, false to re-enable it", examples: [true] }),
      }),
      response: {
        200: okResponseSchema,
        ...standardErrors,
      },
    },
  );

export default toggleEndpoint;
