import Elysia from "elysia";
import { auth } from "@/core/auth";
import { setConnection } from "@/classes/streamer";
import {
  authorizeIntegrationManage,
  getExistingIntegrationSecret,
  logConnectionAudit,
  integrationParamsSchema,
  stripeConnectSchema,
} from "../common";
import { okResponseSchema, standardErrors } from "../../schemas";

export const connectEndpoint = new Elysia()
  .use(auth)
  .post(
    "/stripe",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const { error, ctx, user } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
      );
      if (error) return error;
      const { orgId, streamerId } = ctx!;

      const existing = await getExistingIntegrationSecret(streamerId, "stripe");
      const wasConfigured = Boolean(existing?.secret);

      const code = typeof body === "string" ? body : (body as any)?.code;
      if (code) {
        const apiKey = process.env.STRIPE_API_KEY || process.env.STRIPE_SECRET_KEY || "";
        const exchange = await fetch("https://api.stripe.com/v1/oauth/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
          }),
        });

        const data = await exchange.json();
        if (!exchange.ok || !data.access_token) {
          set.status = "Bad Request";
          return data.error_description || "Failed to exchange Stripe authorization code";
        }

        await setConnection(streamerId, orgId, "stripe", {
          secret: data.access_token,
          token: data.stripe_user_id || null,
          refreshToken: data.refresh_token || null,
          payload: data,
        });

        await logConnectionAudit(orgId, user!.data.id, streamerId, "stripe", wasConfigured, {
          username: data.stripe_user_id,
        });

        return "OK";
      }

      await setConnection(streamerId, orgId, "stripe", body as any);

      await logConnectionAudit(orgId, user!.data.id, streamerId, "stripe", wasConfigured, {
        username: typeof body === "object" && body && "username" in body ? body.username : undefined,
      });

      return "OK";
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Streamer Integrations"],
        summary: "Set Stripe connection",
        description: "Links or updates Stripe payment provider credentials.",
      },
      body: stripeConnectSchema,
      response: {
        200: okResponseSchema,
        ...standardErrors,
      },
    },
  );

export default connectEndpoint;
