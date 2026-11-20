import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { resolveProvider } from "@/classes/streamer";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/streamers/:streamerId/connections/:provider/oauth2",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.INTEGRATION_MANAGE,
          requiredStreamerPerm: StreamerPerm.STREAMER_INTEGRATION_MANAGE,
          actionDescription: "configure integrations",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId, streamerId } = authRes;

      const provider = resolveProvider(params.provider ?? "");
      if (provider === "streamlabs") {
        const state = `${streamerId}.${orgId}`;
        const oauth2Url = `https://streamlabs.com/api/v2.0/authorize?client_id=${process.env.STREAMLABS_CLIENT_ID}&redirect_uri=${integrationRedirectUri[ConnectionProvider.STREAMLABS]}&scope=donations.create&response_type=code&state=${state}`;
        return oauth2Url;
      }

      set.status = "Bad Request";
      return "Provider does not support OAuth2";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Generate connection OAuth2 authorization URL",
        description: "Builds a pre-authenticated OAuth2 authorization URL for third-party integrations like Streamlabs.",
      },
    },
  );

export default endpoint;
