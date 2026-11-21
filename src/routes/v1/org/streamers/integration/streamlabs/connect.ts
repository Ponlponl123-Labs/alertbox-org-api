import Elysia from "elysia";
import { auth } from "@/core/auth";
import { setConnection } from "@/classes/streamer";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";
import { verifyOAuthState } from "@/utils/oauth-state";
import {
  authorizeIntegrationManage,
  getExistingIntegrationSecret,
  logConnectionAudit,
  integrationParamsSchema,
  streamlabsConnectSchema,
} from "../common";
import { okResponseSchema, standardErrors } from "../../schemas";

export const connectEndpoint = new Elysia()
  .use(auth)
  .post(
    "/streamlabs",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const { error, ctx, user } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
      );
      if (error) return error;
      const { orgId, streamerId } = ctx!;

      const code = typeof body === "string" ? body : (body as any)?.code;
      const stateParam = typeof body === "object" && body ? (body as any)?.state : undefined;
      if (!code) {
        set.status = "Bad Request";
        return "Authorization code is required for Streamlabs";
      }
      if (stateParam) {
        const validState = await verifyOAuthState(stateParam, streamerId, orgId, user!.data.id, "streamlabs");
        if (!validState) {
          set.status = "Bad Request";
          return "Invalid or expired OAuth state";
        }
      }

      const existing = await getExistingIntegrationSecret(streamerId, "streamlabs");
      const wasConfigured = Boolean(existing?.secret);

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
          code,
        }),
        signal: AbortSignal.timeout(8000),
      });

      const data = await r.json();

      if (!r.ok || !data.access_token) {
        set.status = "Bad Request";
        return "Failed to exchange Streamlabs authorization code";
      }

      await setConnection(streamerId, orgId, "streamlabs", {
        secret: data.access_token,
        refreshToken: data.refresh_token || null,
      });

      await logConnectionAudit(orgId, user!.data.id, streamerId, "streamlabs", wasConfigured);

      return "OK";
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Streamlabs Relay"],
        summary: "Connect Streamlabs channel integration",
        description: "Exchanges authorization code and links Streamlabs credentials.",
      },
      body: streamlabsConnectSchema,
      response: {
        200: okResponseSchema,
        ...standardErrors,
      },
    },
  );

export default connectEndpoint;
