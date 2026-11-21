import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { setConnection } from "@/classes/streamer";
import { authorizeIntegrationManage, getExistingIntegrationSecret, logConnectionAudit, integrationParamsSchema } from "../common";

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

      await setConnection(streamerId, orgId, "stripe", body as any);

      await logConnectionAudit(orgId, user!.data.id, streamerId, "stripe", wasConfigured, {
        username: typeof body === "object" && body && "username" in body ? body.username : undefined,
      });

      return "OK";
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Organizations"],
        summary: "Set Stripe connection",
        description: "Links or updates Stripe payment provider credentials.",
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
