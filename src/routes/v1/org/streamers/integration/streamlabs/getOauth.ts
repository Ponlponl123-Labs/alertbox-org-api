import Elysia from "elysia";
import { auth } from "@/core/auth";
import { authorizeIntegrationManage, integrationParamsSchema } from "../common";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";

export const getOauthEndpoint = new Elysia()
  .use(auth)
  .get(
    "/streamlabs/oauth2",
    async ({ getAuthenticatedUser, params, set }) => {
      const { error, ctx } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
        "configure integrations",
      );
      if (error) return error;
      const { orgId, streamerId } = ctx!;

      const state = `${streamerId}.${orgId}`;
      return `https://streamlabs.com/api/v2.0/authorize?client_id=${process.env.STREAMLABS_CLIENT_ID}&redirect_uri=${integrationRedirectUri[ConnectionProvider.STREAMLABS]}&scope=donations.create&response_type=code&state=${state}`;
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Organizations"],
        summary: "Generate Streamlabs OAuth2 authorization URL",
        description: "Builds a pre-authenticated OAuth2 authorization URL for Streamlabs integration.",
      },
    },
  );

export default getOauthEndpoint;
