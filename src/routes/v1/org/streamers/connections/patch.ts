import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { resolveProvider, setConnectionDisabled } from "@/classes/streamer";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/:orgId/streamers/:streamerId/connections/:provider",
    async ({ getAuthenticatedUser, params, body, set }) => {
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

      const disabled = Boolean(body.disabled);
      await setConnectionDisabled(streamerId, provider, disabled);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
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
      detail: {
        tags: ["Organizations"],
        summary: "Toggle streamer channel connection status",
        description: "Enables or disables an integration without deleting its credentials using disabledAt.",
      },
      body: t.Object({
        disabled: t.Boolean(),
      }),
    },
  );

export default endpoint;
