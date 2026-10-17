import Elysia, { t } from "elysia";
import { setConnection } from "@/classes/streamer";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";
import { orgContext, requireOrgPermission } from "@/core/org";
import { OrgPerm } from "@/consts/permission";

const postValidation = {
  detail: {
    tags: ["Streamlabs Relay"],
    summary: "Connect Streamlabs account via authorization code",
    description:
      "Exchanges the Streamlabs OAuth2 authorization `code` with Streamlabs API for access and refresh tokens, linking Streamlabs to the active streamer account.",
  },
  body: t.String({
    description: "Streamlabs authorization code from the OAuth redirect query.",
    examples: ["sl_code_9a8b7c6d5e"],
  }),
  response: {
    200: t.String({
      description: "Streamlabs connected successfully.",
      examples: ["OK"],
    }),
  },
};

export const endpoint = new Elysia()
  .use(orgContext)
  .post(
    "/",
    async ({ org, set, body }) => {
      if (!org) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      if (!requireOrgPermission(org, OrgPerm.INTEGRATION_MANAGE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to configure integrations";
      }

      const r = await fetch("https://streamlabs.com/api/v2.0/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: process.env.STREAMLABS_CLIENT_ID!,
          client_secret: process.env.STREAMLABS_CLIENT_SECRET!,
          redirect_uri: integrationRedirectUri[ConnectionProvider.STREAMLABS],
          code: body,
        } as any),
      });

      const data = await r.json();

      if (!r.ok || !data.access_token) {
        set.status = "Bad Request";
        return "Bad Request";
      }

      await setConnection(org.streamerId, org.orgId, "streamlabs", {
        secret: data.access_token,
        refreshToken: data.refresh_token || null,
      });

      return "OK";
    },
    postValidation,
  );

export default endpoint;
