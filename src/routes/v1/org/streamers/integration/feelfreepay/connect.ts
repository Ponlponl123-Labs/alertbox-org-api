import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { setConnection } from "@/classes/streamer";
import { authorizeIntegrationManage, getExistingIntegrationSecret, logConnectionAudit, integrationParamsSchema } from "../common";

async function handleFfpConnect({ getAuthenticatedUser, params, body, set }: any) {
  const { error, ctx, user } = await authorizeIntegrationManage(
    getAuthenticatedUser,
    params.orgId,
    params.streamerId,
    set,
  );
  if (error) return error;
  const { orgId, streamerId } = ctx!;

  const existing = await getExistingIntegrationSecret(streamerId, "feelfreepay");
  const wasConfigured = Boolean(existing?.secret);

  await setConnection(streamerId, orgId, "feelfreepay", body as any);

  await logConnectionAudit(orgId, user!.data.id, streamerId, "feelfreepay", wasConfigured, {
    username: typeof body === "object" && body && "username" in body ? body.username : undefined,
  });

  return "OK";
}

const validation = {
  params: integrationParamsSchema,
  detail: {
    tags: ["Organizations"],
    summary: "Set FeelFreePay connection",
    description: "Links or updates FeelFreePay payment provider credentials.",
  },
  body: t.Union([
    t.Object({
      username: t.Optional(t.Nullable(t.String())),
      secret: t.Optional(t.String()),
      code: t.Optional(t.String()),
    }),
    t.String(),
  ]),
};

export const connectEndpoint = new Elysia()
  .use(auth)
  .post("/feelfreepay", handleFfpConnect, validation)
  .post("/ffp", handleFfpConnect, validation);

export default connectEndpoint;
