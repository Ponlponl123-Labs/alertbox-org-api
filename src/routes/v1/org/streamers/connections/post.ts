import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { OrgPerm, StreamerPerm } from "@/utils/rbac";
import { authorizeStreamer } from "@/core/org";
import {
  resolveProvider,
  allowed_user_update_providers,
  setConnection,
} from "@/classes/streamer";

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

      await setConnection(streamerId, orgId, provider, body as any);
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
