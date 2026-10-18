import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import {
  resolveProvider,
  allowed_user_update_providers,
  setConnection,
} from "@/classes/streamer";
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
      if (!provider || !allowed_user_update_providers.includes(provider)) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      if (provider === "kofi" || provider === "buymeacoffee") {
        if (typeof body === "string" || !body.username || !body.secret) {
          set.status = "Bad Request";
          return "Username and secret are required for this provider";
        }
      }

      const existing = await db
        .selectFrom("Integration")
        .select(["stripeSecret", "bmacSecret", "kofiSecret", "xenditSecret", "ffpSecret", "streamlabsSecret"])
        .where("streamerId", "=", Number(streamerId))
        .executeTakeFirst();

      const wasConfigured = existing
        ? Boolean(
            provider === "stripe"
              ? existing.stripeSecret
              : provider === "buymeacoffee"
                ? existing.bmacSecret
                : provider === "kofi"
                  ? existing.kofiSecret
                  : provider === "xendit"
                    ? existing.xenditSecret
                    : provider === "feelfreepay"
                      ? existing.ffpSecret
                      : provider === "streamlabs"
                        ? existing.streamlabsSecret
                        : false,
          )
        : false;

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
          secret: t.String(),
        }),
        t.String(),
      ]),
    },
  );

export default endpoint;
