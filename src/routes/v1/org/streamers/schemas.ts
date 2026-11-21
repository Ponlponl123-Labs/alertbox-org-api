import { t } from "elysia";

export const orgStreamersParamsSchema = t.Object({
  orgId: t.String({
    description: "Organization ID or slug",
    examples: ["1", "my-org"],
  }),
});

export const streamerParamsSchema = t.Object({
  orgId: t.String({
    description: "Organization ID or slug",
    examples: ["1", "my-org"],
  }),
  streamerId: t.String({
    description: "Streamer channel ID or handle",
    examples: ["1", "creator_channel"],
  }),
});

export const streamerTxParamsSchema = t.Object({
  orgId: t.String({
    description: "Organization ID or slug",
    examples: ["1", "my-org"],
  }),
  streamerId: t.String({
    description: "Streamer channel ID or handle",
    examples: ["1", "creator_channel"],
  }),
  txId: t.String({
    description: "Transaction record numeric ID",
    examples: ["101"],
  }),
});

export const okResponseSchema = t.String({
  description: "Standard OK success response",
  examples: ["OK"],
});

export const standardErrors = {
  400: t.String({ description: "Bad Request: Invalid parameters or malformed request" }),
  401: t.String({ description: "Unauthorized: Missing or invalid authentication token" }),
  403: t.String({ description: "Forbidden: Insufficient permissions for this action" }),
  404: t.String({ description: "Not Found: Target organization or streamer channel does not exist" }),
};

export const streamerChannelSummarySchema = t.Object({
  id: t.String({ description: "Streamer channel numeric ID", examples: ["1"] }),
  orgId: t.String({ description: "Owning organization numeric ID", examples: ["1"] }),
  name: t.String({ description: "Unique channel handle", examples: ["streamer_one"] }),
  displayName: t.String({ description: "Public display name", examples: ["Streamer One"] }),
  bio: t.Nullable(t.String({ description: "Creator bio text" })),
  avatar: t.Nullable(t.String({ description: "Avatar image URL or CDN path" })),
  banner: t.Nullable(t.String({ description: "Banner image URL or CDN path" })),
  accentColor: t.Nullable(t.String({ description: "Profile theme hex/oklch accent color" })),
  socialDiscord: t.Nullable(t.String()),
  socialFacebook: t.Nullable(t.String()),
  socialReddit: t.Nullable(t.String()),
  socialTwitch: t.Nullable(t.String()),
  socialTwitter: t.Nullable(t.String()),
  socialYoutube: t.Nullable(t.String()),
  uri: t.Nullable(t.String({ description: "Claimed public tipping handle slug" })),
  publishedAt: t.Nullable(t.Any({ description: "Timestamp when channel was made public" })),
  updatedAt: t.Nullable(t.Any()),
  createdAt: t.Nullable(t.Any()),
  integrations: t.Object({
    stripe: t.Boolean({ description: "Whether Stripe payment is configured & active" }),
    bmac: t.Boolean({ description: "Whether Buy Me a Coffee webhook is active" }),
    kofi: t.Boolean({ description: "Whether Ko-fi webhook is active" }),
    streamlabs: t.Boolean({ description: "Whether Streamlabs relay is connected" }),
  }),
  members: t.Optional(t.Number({ description: "Count of assigned team members" })),
});

export const streamerCreateResponseSchema = t.Object({
  id: t.String({ description: "Streamer channel numeric ID", examples: ["1"] }),
  name: t.String({ description: "Unique channel handle", examples: ["streamer_one"] }),
  displayName: t.String({ description: "Public display name", examples: ["Streamer One"] }),
  avatar: t.Nullable(t.String({ description: "Avatar image URL" })),
  uri: t.Nullable(t.String({ description: "Claimed handle slug" })),
  widgets: t.Array(
    t.Object({
      id: t.String({ description: "Widget ID" }),
      type: t.String({ description: "Widget type", examples: ["ALERTBOX"] }),
      token: t.String({ description: "Widget access token" }),
    }),
  ),
  createdAt: t.Any({ description: "Channel creation date" }),
}, { description: "Provisioned streamer channel and initial AlertBox widget" });

export const streamerUpdateResponseSchema = t.Object({
  id: t.String({ description: "Channel ID" }),
  name: t.String({ description: "Channel handle" }),
  displayName: t.String({ description: "Display name" }),
  bio: t.Nullable(t.String()),
  avatar: t.Nullable(t.String()),
  banner: t.Nullable(t.String()),
  accentColor: t.Nullable(t.Any()),
  twitch: t.Nullable(t.String()),
  youtube: t.Nullable(t.String()),
  twitter: t.Nullable(t.String()),
  facebook: t.Nullable(t.String()),
  reddit: t.Nullable(t.String()),
  discord: t.Nullable(t.String()),
}, { description: "Updated streamer channel profile" });

export const streamerTransactionsResponseSchema = t.Object({
  total: t.Number({ description: "Total matching transactions count", examples: [42] }),
  limit: t.Number({ description: "Page limit", examples: [25] }),
  offset: t.Number({ description: "Page offset", examples: [0] }),
  nextCursor: t.Optional(t.Nullable(t.String({ description: "Keyset pagination cursor" }))),
  transactions: t.Array(
    t.Object({
      id: t.String({ description: "Transaction ID", examples: ["101"] }),
      provider: t.String({ description: "Payment gateway provider", examples: ["STRIPE", "BUYMEACOFFEE"] }),
      type: t.String({ description: "Transaction type", examples: ["TIP", "MEMBERSHIP"] }),
      status: t.String({ description: "Payment status", examples: ["COMPLETED", "FAILED"] }),
      isTest: t.Boolean({ description: "Whether this transaction was a test simulation" }),
      amount: t.Number({ description: "Amount in smallest currency unit (e.g. cents/satang)", examples: [5000] }),
      currency: t.String({ description: "Currency code", examples: ["THB", "USD"] }),
      senderName: t.Nullable(t.String({ description: "Supporter or donor name", examples: ["Supporter"] })),
      message: t.Nullable(t.String({ description: "Donation message text" })),
      createdAt: t.String({ description: "ISO creation timestamp" }),
      isDeleted: t.Boolean({ description: "Whether soft-deleted from overlay / dashboards" }),
    }),
  ),
}, { description: "Paginated list of sanitized streamer transactions" });

export const streamerTestTxResponseSchema = t.Object({
  success: t.Boolean({ description: "Test dispatch success flag", examples: [true] }),
  transaction: t.Object({
    id: t.String({ description: "Simulated transaction ID" }),
    provider: t.String(),
    type: t.String(),
    status: t.String(),
    isTest: t.Boolean(),
    amount: t.Number(),
    currency: t.String(),
    senderName: t.Nullable(t.String()),
    message: t.Nullable(t.String()),
    createdAt: t.String(),
    isDeleted: t.Boolean(),
  }),
}, { description: "Created test transaction and dispatch confirmation" });

export const streamerTxToggleResponseSchema = t.Object({
  id: t.String({ description: "Transaction ID" }),
  isDeleted: t.Boolean({ description: "New soft-delete state" }),
  deletedAt: t.Nullable(t.String({ description: "Timestamp when marked deleted" })),
}, { description: "Updated transaction soft-delete status" });

export const streamerResendTxResponseSchema = t.Object({
  success: t.Boolean({ description: "Whether alert was dispatched to overlay" }),
  message: t.String({ description: "Status summary message" }),
  transaction: t.Any({ description: "Dispatched transaction object" }),
}, { description: "Re-dispatched alert confirmation and transaction payload" });

export const streamerAuditResponseSchema = t.Object({
  total: t.Number({ description: "Total audit events count" }),
  limit: t.Number({ description: "Page limit" }),
  offset: t.Number({ description: "Page offset" }),
  nextCursor: t.Optional(t.Nullable(t.String({ description: "Keyset pagination cursor" }))),
  logs: t.Array(
    t.Object({
      id: t.String(),
      orgId: t.String(),
      action: t.String(),
      targetType: t.String(),
      targetId: t.Nullable(t.String()),
      payload: t.Any(),
      ipAddress: t.Nullable(t.String()),
      createdAt: t.String(),
      user: t.Object({
        id: t.String(),
        name: t.Nullable(t.String()),
        email: t.String(),
        avatar: t.Nullable(t.String()),
      }),
    }),
  ),
}, { description: "Paginated streamer channel audit logs" });

export const tinyStreamerResponseSchema = t.Object({
  id: t.String({ description: "Streamer channel numeric ID", examples: ["1"] }),
  name: t.String({ description: "Unique channel handle", examples: ["streamer_one"] }),
  displayName: t.Nullable(t.String({ description: "Channel display name", examples: ["Streamer One"] })),
  avatar: t.Nullable(t.String({ description: "Channel avatar URL" })),
}, { description: "Lightweight streamer channel profile" });

export const streamerIntegrationsResponseSchema = t.Object({
  stripe: t.Nullable(t.String({ description: "Masked Stripe secret or credentials" })),
  bmac: t.Nullable(
    t.Object({
      username: t.String({ description: "Buy Me a Coffee username" }),
      secret: t.String({ description: "Masked webhook secret" }),
    }),
  ),
  kofi: t.Nullable(
    t.Object({
      username: t.String({ description: "Ko-fi username" }),
      secret: t.String({ description: "Masked verification token" }),
    }),
  ),
  xendit: t.Nullable(t.String({ description: "Masked Xendit secret" })),
  ffp: t.Nullable(t.String({ description: "Masked FeelFreePay secret" })),
  youtube: t.Nullable(t.Any()),
  facebook: t.Nullable(t.Any()),
  twitch: t.Nullable(t.Any()),
  patreon: t.Nullable(t.Any()),
  streamlabs: t.Boolean({ description: "Whether Streamlabs relay is configured" }),
  disabled: t.Object({
    stripe: t.Boolean(),
    bmac: t.Boolean(),
    buymeacoffee: t.Boolean(),
    kofi: t.Boolean(),
    xendit: t.Boolean(),
    ffp: t.Boolean(),
    feelfreepay: t.Boolean(),
    streamlabs: t.Boolean(),
  }),
}, { description: "Configured streamer integrations and disabled flags" });
