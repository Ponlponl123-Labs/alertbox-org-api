import Elysia from "elysia";
import { auth } from "@/core/auth";
import { setConnection } from "@/classes/streamer";
import {
  authorizeIntegrationManage,
  getExistingIntegrationSecret,
  logConnectionAudit,
  integrationParamsSchema,
  kofiConnectSchema,
  resolvePreservedSecret,
} from "../common";
import { okResponseSchema, standardErrors } from "../../schemas";

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

      const existing = await getExistingIntegrationSecret(streamerId, "kofi");
      const wasConfigured = Boolean(existing?.secret);
      const resolvedSecret = resolvePreservedSecret(body?.secret, existing?.secret);

      await setConnection(streamerId, orgId, "kofi", {
        ...(body as any),
        ...(resolvedSecret !== undefined ? { secret: resolvedSecret } : {}),
      });

      await logConnectionAudit(orgId, user!.data.id, streamerId, "kofi", wasConfigured, {
        username: body.username,
      });

      return "OK";
    },
    {
      params: integrationParamsSchema,
      detail: {
        tags: ["Streamer Integrations"],
        summary: "Set Ko-fi connection",
        description: "Links or updates Ko-fi username and verification token.",
      },
      body: kofiConnectSchema,
      response: {
        200: okResponseSchema,
        ...standardErrors,
      },
    },
  );

export default connectEndpoint;
