import Elysia from "elysia";
import { auth } from "@/core/auth";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";
import { authorizeIntegrationManage, integrationParamsSchema } from "../common";

export const getOauthEndpoint = new Elysia()
  .use(auth)
  .get(
    "/stripe/oauth2",
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
      const oauth2Url = new URL("https://marketplace.stripe.com/oauth/v2/");
      if (process.env["STRIPE_TEST_MODE"] === "true" && process.env["STRIPE_TEST_LINK_ID"]) {
        oauth2Url.pathname += `${process.env["STRIPE_TEST_LINK_ID"]}/authorize`;
      } else {
        oauth2Url.pathname += "authorize";
      }

      oauth2Url.searchParams.append("client_id", process.env["STRIPE_CLIENT_ID"]!);
      oauth2Url.searchParams.append("redirect_uri", integrationRedirectUri[ConnectionProvider.STRIPE]);
      oauth2Url.searchParams.append("state", state);

      return oauth2Url.href;
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Organizations"],
        summary: "Generate Stripe OAuth2 authorization URL",
        description: "Builds a pre-authenticated OAuth2 authorization URL for Stripe integration.",
      },
    },
  );

export default getOauthEndpoint;
