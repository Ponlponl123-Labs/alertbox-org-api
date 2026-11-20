import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import {
  resolveProvider,
  allowed_user_update_providers,
  setConnection,
  providerToIntegrationType,
} from "@/classes/streamer";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .post(
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
      if (
        !provider ||
        (!allowed_user_update_providers.includes(provider) && provider !== "streamlabs")
      ) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      if (provider === "kofi" || provider === "buymeacoffee") {
        if (typeof body === "string" || !body.username || !body.secret) {
          set.status = "Bad Request";
          return "Username and secret are required for this provider";
        }
      }

      const intType = providerToIntegrationType[provider.toLowerCase()];
      const existing = intType
        ? await db
            .selectFrom("Integration")
            .select(["secret"])
            .where("streamerId", "=", Number(streamerId))
            .where("type", "=", intType)
            .where("deletedAt", "is", null)
            .executeTakeFirst()
        : null;

      const wasConfigured = Boolean(existing?.secret);

      if (provider === "streamlabs") {
        const code = typeof body === "string" ? body : (body as any)?.code;
        if (!code) {
          set.status = "Bad Request";
          return "Authorization code is required for Streamlabs";
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
            code,
          }),
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

        await logOrgAudit({
          orgId,
          userId: user.data.id,
          action: wasConfigured ? "INTEGRATION_UPDATED" : "INTEGRATION_CONNECTED",
          targetType: "STREAMER",
          targetId: BigInt(streamerId),
          payload: {
            streamerId: String(streamerId),
            platform: provider,
          },
        });

        return "OK";
      }

      await setConnection(streamerId, orgId, provider, body as any);

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: wasConfigured ? "INTEGRATION_UPDATED" : "INTEGRATION_CONNECTED",
        targetType: "STREAMER",
        targetId: BigInt(streamerId),
        payload: {
          streamerId: String(streamerId),
          platform: provider,
          username: typeof body === "object" && body && "username" in body ? body.username : undefined,
        },
      });

      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Set streamer channel connection",
        description: "Links or updates payment provider credentials for a streamer channel.",
      },
      body: t.Union([
        t.Object({
          username: t.Optional(t.Nullable(t.String())),
          secret: t.Optional(t.String()),
          code: t.Optional(t.String()),
        }),
        t.String(),
      ]),
    },
  );

export default endpoint;
