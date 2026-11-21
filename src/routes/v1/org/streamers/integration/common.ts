import { db } from "@/db";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { providerToIntegrationType } from "@/classes/streamer";
import { logOrgAudit } from "@/core/audit";
import { t } from "elysia";

export const integrationParamsSchema = t.Object({
  orgId: t.String({ description: "Organization ID or slug" }),
  streamerId: t.String({ description: "Streamer ID or handle" }),
});

export const integrationProviderParamsSchema = t.Object({
  orgId: t.String({ description: "Organization ID or slug" }),
  streamerId: t.String({ description: "Streamer ID or handle" }),
  provider: t.String({ description: "Integration provider name or alias" }),
});

export async function authorizeIntegrationManage(
  getAuthenticatedUser: () => Promise<any>,
  orgParam: string | null | undefined,
  streamerParam: string | null | undefined,
  set: { status?: any },
  actionDescription = "manage integrations",
) {
  const user = await getAuthenticatedUser();
  const authRes = await authorizeStreamer(
    orgParam,
    streamerParam,
    user.data.id,
    {
      requiredOrgPerm: OrgPerm.INTEGRATION_MANAGE,
      requiredStreamerPerm: StreamerPerm.STREAMER_INTEGRATION_MANAGE,
      actionDescription,
    },
    set,
  );
  if (typeof authRes === "string") {
    return {
      error: set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes,
      ctx: null,
      user: null,
    };
  }
  return { error: null, ctx: authRes, user };
}

export async function getExistingIntegrationSecret(
  streamerId: string | bigint | number,
  provider: string,
) {
  const intType = providerToIntegrationType[provider.toLowerCase()];
  if (!intType) return null;
  return db
    .selectFrom("Integration")
    .select(["secret"])
    .where("streamerId", "=", Number(streamerId))
    .where("type", "=", intType)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
}

export async function logConnectionAudit(
  orgId: bigint | string | number,
  userId: bigint | string | number,
  streamerId: bigint | string | number,
  provider: string,
  wasConfigured: boolean,
  extra?: Record<string, any>,
) {
  await logOrgAudit({
    orgId: typeof orgId === "bigint" ? orgId : BigInt(orgId),
    userId: typeof userId === "bigint" ? userId : BigInt(userId),
    action: wasConfigured ? "INTEGRATION_UPDATED" : "INTEGRATION_CONNECTED",
    targetType: "STREAMER",
    targetId: typeof streamerId === "bigint" ? streamerId : BigInt(streamerId),
    payload: {
      streamerId: String(streamerId),
      platform: provider,
      ...extra,
    },
  });
}
