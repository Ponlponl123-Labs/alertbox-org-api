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

export const bmacConnectSchema = t.Object({
  username: t.String({
    description: "Buy Me a Coffee page username or handle",
    examples: ["creator"],
  }),
  secret: t.String({
    description: "Buy Me a Coffee webhook secret token",
  }),
});

export const kofiConnectSchema = t.Object({
  username: t.String({
    description: "Ko-fi page username or handle",
    examples: ["creator"],
  }),
  secret: t.String({
    description: "Ko-fi verification token from webhook settings",
  }),
});

export const streamlabsConnectSchema = t.Union([
  t.Object({
    code: t.String({
      description: "OAuth2 authorization code from Streamlabs callback",
    }),
    state: t.Optional(
      t.String({
        description: "Signed single-use OAuth state parameter",
      }),
    ),
  }),
  t.String({
    description: "OAuth2 authorization code as plain text string",
  }),
]);

export const stripeConnectSchema = t.Union([
  t.Object({
    code: t.String({
      description: "Stripe Connect OAuth2 authorization code (ac_...)",
    }),
    state: t.Optional(
      t.String({
        description: "Signed single-use OAuth state parameter",
      }),
    ),
  }),
  t.String({
    description: "Stripe Connect OAuth2 authorization code as plain text string",
  }),
  t.Object(
    {
      secret: t.Optional(t.String({ description: "Direct Stripe secret or access token (rk_... or sk_...)" })),
      token: t.Optional(t.String({ description: "Connected Stripe account ID or token (acct_...)" })),
      secretType: t.Optional(t.String({ description: "Credential type identifier (e.g. oauth, api_key)" })),
      state: t.Optional(t.String({ description: "OAuth state payload" })),
      refreshToken: t.Optional(t.String({ description: "OAuth refresh token" })),
      payload: t.Optional(t.Any({ description: "Raw provider response or metadata" })),
    },
    { additionalProperties: true, description: "Direct Stripe credentials payload" },
  ),
]);

export const feelFreePayConnectSchema = t.Union([
  t.Object({
    secret: t.String({
      description: "FeelFreePay API secret or webhook token",
    }),
    username: t.Optional(
      t.Nullable(
        t.String({
          description: "FeelFreePay merchant ID or username",
        }),
      ),
    ),
  }),
  t.String({
    description: "FeelFreePay secret as plain text string",
  }),
]);

export const xenditConnectSchema = t.Union([
  t.Object({
    secret: t.String({
      description: "Xendit secret API key",
    }),
    token: t.Optional(
      t.Nullable(
        t.String({
          description: "Xendit webhook verification token",
        }),
      ),
    ),
  }),
  t.String({
    description: "Xendit secret as plain text string",
  }),
]);

export const fallbackConnectSchema = t.Any({
  description: "Payload for unsupported provider fallback endpoint",
});

export const integrationSchema = t.Union([
  t.Object(
    {
      username: t.Optional(t.Nullable(t.String())),
      secret: t.Optional(t.Nullable(t.String())),
      secretType: t.Optional(t.Nullable(t.String())),
      token: t.Optional(t.Nullable(t.String())),
      state: t.Optional(t.Nullable(t.String())),
      code: t.Optional(t.Nullable(t.String())),
      refreshToken: t.Optional(t.Nullable(t.String())),
      options: t.Optional(t.Nullable(t.Numeric())),
      payload: t.Optional(t.Nullable(t.Any())),
    },
    { additionalProperties: true },
  ),
  t.String(),
]);

export const integrationBodySchema = integrationSchema;

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

export function resolvePreservedSecret(
  submitted: string | null | undefined,
  existingSecret: string | null | undefined,
): string | undefined {
  if (typeof submitted === "string" && submitted.startsWith("••••") && existingSecret) {
    return existingSecret;
  }
  return submitted ?? undefined;
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
