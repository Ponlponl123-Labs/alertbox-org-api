import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { setConnectionDisabled } from "@/classes/streamer";
import { authorizeIntegrationManage, integrationParamsSchema } from "../common";
import { logOrgAudit } from "@/core/audit";
import { okResponseSchema, standardErrors } from "../../schemas";

async function handlePatch({ getAuthenticatedUser, params, body, set }: any) {
  const { error, ctx, user } = await authorizeIntegrationManage(
    getAuthenticatedUser,
    params.orgId,
    params.streamerId,
    set,
  );
  if (error) return error;
  const { orgId, streamerId } = ctx!;

  if (body && "options" in body) {
    await db
      .updateTable("Integration")
      .set({
        options: Number(body.options),
        updatedAt: new Date(),
      })
      .where("streamerId", "=", Number(streamerId))
      .where("type", "=", "STREAMLABS")
      .execute();

    await logOrgAudit({
      orgId,
      userId: user!.data.id,
      action: "INTEGRATION_UPDATED",
      targetType: "STREAMER",
      targetId: BigInt(streamerId),
      payload: {
        streamerId: String(streamerId),
        platform: "streamlabs",
        options: Number(body.options),
      },
    });

    return "OK";
  }

  if (body && "disabled" in body) {
    const disabled = Boolean(body.disabled);
    await setConnectionDisabled(streamerId, "streamlabs", disabled);

    await logOrgAudit({
      orgId,
      userId: user!.data.id,
      action: disabled ? "INTEGRATION_DISABLED" : "INTEGRATION_ENABLED",
      targetType: "STREAMER",
      targetId: BigInt(streamerId),
      payload: {
        streamerId: String(streamerId),
        platform: "streamlabs",
        disabled,
      },
    });

    return "OK";
  }

  set.status = "Bad Request";
  return "Invalid update payload";
}

const validation = {
  params: integrationParamsSchema,
  detail: {
    tags: ["Streamlabs Relay"],
    summary: "Update Streamlabs preferences or status",
    description: "Updates relay options bitflag or toggles disabled status.",
  },
  body: t.Union([
    t.Object({
      options: t.Integer({ minimum: 0, maximum: 255, description: "Streamlabs relay options bitflag (0-255)", examples: [3] }),
    }),
    t.Object({
      disabled: t.Boolean({ description: "Toggle Streamlabs relay active status", examples: [true] }),
    }),
  ]),
  response: {
    200: okResponseSchema,
    ...standardErrors,
  },
};

export const optionsEndpoint = new Elysia()
  .use(auth)
  .patch("/streamlabs", handlePatch, validation)
  .patch("/streamlabs/options", handlePatch, validation);

export default optionsEndpoint;
