import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { authorizeIntegrationManage, integrationParamsSchema } from "../common";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";
import { createOAuthState } from "@/utils/oauth-state";
import { standardErrors } from "../../schemas";

export const getOauthEndpoint = new Elysia()
  .use(auth)
  .get(
    "/streamlabs/oauth2",
    async ({ getAuthenticatedUser, params, set }) => {
      const { error, ctx, user } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
        "configure integrations",
      );
      if (error) return error;
      const { orgId, streamerId } = ctx!;

      const state = await createOAuthState(streamerId, orgId, user!.data.id, "streamlabs");
      return `https://streamlabs.com/api/v2.0/authorize?client_id=${process.env.STREAMLABS_CLIENT_ID}&redirect_uri=${integrationRedirectUri[ConnectionProvider.STREAMLABS]}&scope=donations.create&response_type=code&state=${state}`;
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Streamlabs Relay"],
        summary: "Generate Streamlabs OAuth2 authorization URL",
        description: "Builds a pre-authenticated OAuth2 authorization URL for Streamlabs integration.",
      },
      response: {
        200: t.String({ description: "Pre-authenticated Streamlabs OAuth2 URL string", examples: ["https://streamlabs.com/api/v2.0/authorize?..."] }),
        ...standardErrors,
      },
    },
  );

export default getOauthEndpoint;
