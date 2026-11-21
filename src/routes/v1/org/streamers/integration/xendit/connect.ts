import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { setConnection, allowed_user_update_providers } from "@/classes/streamer";
import { authorizeIntegrationManage, getExistingIntegrationSecret, logConnectionAudit, integrationParamsSchema } from "../common";

export const connectEndpoint = new Elysia()
  .use(auth)
  .post(
    "/xendit",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const { error, ctx, user } = await authorizeIntegrationManage(
        getAuthenticatedUser,
        params.orgId,
        params.streamerId,
        set,
      );
      if (error) return error;
      const { orgId, streamerId } = ctx!;

      if (!allowed_user_update_providers.includes("xendit" as any)) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      const existing = await getExistingIntegrationSecret(streamerId, "xendit");
      const wasConfigured = Boolean(existing?.secret);

      await setConnection(streamerId, orgId, "xendit", body as any);

      await logConnectionAudit(orgId, user!.data.id, streamerId, "xendit", wasConfigured, {
        username: typeof body === "object" && body && "username" in body ? body.username : undefined,
      });

      return "OK";
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Organizations"],
        summary: "Set Xendit connection",
        description: "Links or updates Xendit credentials.",
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
