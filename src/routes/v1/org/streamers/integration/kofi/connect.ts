import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { setConnection } from "@/classes/streamer";
import { authorizeIntegrationManage, getExistingIntegrationSecret, logConnectionAudit, integrationParamsSchema } from "../common";

export const connectEndpoint = new Elysia()
  .use(auth)
  .post(
    "/kofi",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const { error, ctx, user } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
      );
      if (error) return error;
      const { orgId, streamerId } = ctx!;

      if (typeof body === "string" || !body?.username || !body?.secret) {
        set.status = "Bad Request";
        return "Username and secret are required for this provider";
      }

      const existing = await getExistingIntegrationSecret(streamerId, "kofi");
      const wasConfigured = Boolean(existing?.secret);

      await setConnection(streamerId, orgId, "kofi", body as any);

      await logConnectionAudit(orgId, user!.data.id, streamerId, "kofi", wasConfigured, {
        username: body.username,
      });

      return "OK";
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Organizations"],
        summary: "Set Ko-fi connection",
        description: "Links or updates Ko-fi username and verification token.",
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

export default connectEndpoint;
