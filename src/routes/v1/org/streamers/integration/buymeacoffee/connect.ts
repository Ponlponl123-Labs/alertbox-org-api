import Elysia from "elysia";
import { auth } from "@/core/auth";
import { setConnection } from "@/classes/streamer";
import {
  authorizeIntegrationManage,
  getExistingIntegrationSecret,
  logConnectionAudit,
  integrationParamsSchema,
  bmacConnectSchema,
} from "../common";
import { okResponseSchema, standardErrors } from "../../schemas";

async function handleBmacConnect({ getAuthenticatedUser, params, body, set }: any) {
  const { error, ctx, user } = await authorizeIntegrationManage(
    getAuthenticatedUser,
    params.orgId,
    params.streamerId,
    set,
  );
  if (error) return error;
  const { orgId, streamerId } = ctx!;

  const existing = await getExistingIntegrationSecret(streamerId, "buymeacoffee");
  const wasConfigured = Boolean(existing?.secret);

  await setConnection(streamerId, orgId, "buymeacoffee", body as any);

  await logConnectionAudit(orgId, user!.data.id, streamerId, "buymeacoffee", wasConfigured, {
    username: body.username,
  });

  return "OK";
}

const validation = {
  params: integrationParamsSchema,
  detail: {
    tags: ["Streamer Integrations"],
    summary: "Set Buy Me a Coffee connection",
    description: "Links or updates Buy Me a Coffee username and webhook secret.",
  },
  body: bmacConnectSchema,
  response: {
    200: okResponseSchema,
    ...standardErrors,
  },
};

export const connectEndpoint = new Elysia()
  .use(auth)
  .post("/buymeacoffee", handleBmacConnect, validation)
  .post("/bmac", handleBmacConnect, validation);

export default connectEndpoint;
