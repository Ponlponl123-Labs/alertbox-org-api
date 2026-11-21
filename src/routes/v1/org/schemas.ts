import { t } from "elysia";
import { OrgRole } from "@/db";

export const orgParamsSchema = t.Object({
  orgId: t.String({
    description: "Organization numeric ID or unique slug",
    examples: ["1", "my-organization"],
  }),
});

export const orgMemberParamsSchema = t.Object({
  orgId: t.String({
    description: "Organization numeric ID or unique slug",
    examples: ["1", "my-organization"],
  }),
  memberId: t.String({
    description: "Organization member numeric ID",
    examples: ["1"],
  }),
});

export const orgInviteParamsSchema = t.Object({
  orgId: t.String({
    description: "Organization numeric ID or unique slug",
    examples: ["1", "my-organization"],
  }),
  inviteId: t.String({
    description: "Organization invitation record numeric ID",
    examples: ["1"],
  }),
});

export const orgPresetParamsSchema = t.Object({
  orgId: t.String({
    description: "Organization numeric ID or unique slug",
    examples: ["1", "my-organization"],
  }),
  presetId: t.String({
    description: "Permission preset UUID",
    examples: ["c4b1e840-02c3-4d7a-bfa1-e63d6b0521e1"],
  }),
});

export const orgUserParamsSchema = t.Object({
  orgId: t.String({
    description: "Organization numeric ID or unique slug",
    examples: ["1", "my-organization"],
  }),
  userId: t.String({
    description: "User numeric ID",
    examples: ["1"],
  }),
});

export const okResponseSchema = t.String({
  description: "Standard OK success response",
  examples: ["OK"],
});

export const standardOrgErrors = {
  400: t.String({ description: "Bad Request: Invalid ID or parameters" }),
  401: t.String({ description: "Unauthorized: Missing or invalid session token" }),
  403: t.String({ description: "Forbidden: Insufficient organization permissions" }),
  404: t.String({ description: "Not Found: Target organization or resource not found" }),
};

export const orgDetailsResponseSchema = t.Object({
  id: t.String({ description: "Organization ID", examples: ["1"] }),
  name: t.String({ description: "Organization display name", examples: ["My Team"] }),
  slug: t.Nullable(t.String({ description: "Custom organization URL slug", examples: ["my-team"] })),
  avatar: t.Nullable(t.String({ description: "Avatar image URL or path" })),
  banner: t.Nullable(t.String({ description: "Banner image URL or path" })),
  role: t.String({ description: "Caller's assigned role in organization", examples: ["OWNER", "ADMIN", "MEMBER"] }),
  permissions: t.String({ description: "Caller's effective bitmask permissions as a numeric string", examples: ["16777215"] }),
  memberCount: t.Number({ description: "Total active members count in organization", examples: [5] }),
  streamers: t.Array(
    t.Object({
      id: t.String({ description: "Streamer channel numeric ID", examples: ["1"] }),
      name: t.String({ description: "Channel handle", examples: ["channel_one"] }),
      displayName: t.Nullable(t.String({ description: "Public display name", examples: ["Channel One"] })),
      avatar: t.Nullable(t.String({ description: "Avatar URL" })),
      uri: t.Nullable(t.String({ description: "Tipping handle slug" })),
      publishedAt: t.Nullable(t.Any({ description: "Timestamp when published" })),
    }),
  ),
  createdAt: t.Any({ description: "Organization creation timestamp" }),
}, { description: "Organization details, caller role/permissions, and streamer channels" });

export const orgUpdateResponseSchema = t.Object({
  id: t.String({ description: "Organization ID", examples: ["1"] }),
  type: t.String({ description: "Organization tier", examples: ["COMMUNITY", "ENTERPRISE"] }),
  name: t.String({ description: "Updated organization name", examples: ["New Org Name"] }),
  slug: t.Nullable(t.String({ description: "Organization slug", examples: ["new-org-name"] })),
  avatar: t.Nullable(t.String({ description: "Avatar URL" })),
  banner: t.Nullable(t.String({ description: "Banner URL" })),
}, { description: "Updated organization metadata" });

export const orgTransferResponseSchema = t.Object({
  success: t.Boolean({ description: "Whether transfer succeeded", examples: [true] }),
  previousOwnerId: t.String({ description: "User ID of previous owner", examples: ["1"] }),
  newOwnerId: t.String({ description: "User ID of new owner", examples: ["2"] }),
  newOwnerMemberId: t.String({ description: "Member record ID of new owner", examples: ["3"] }),
}, { description: "Ownership transfer confirmation" });

export const orgMemberSummarySchema = t.Object({
  id: t.String({ description: "Member record numeric ID", examples: ["1"] }),
  userId: t.String({ description: "User numeric ID", examples: ["10"] }),
  email: t.String({ description: "User email address", examples: ["user@example.com"] }),
  name: t.Nullable(t.String({ description: "User display name", examples: ["Jane Doe"] })),
  avatar: t.Nullable(t.String({ description: "User avatar URL" })),
  role: t.String({ description: "Assigned organization role", examples: ["ADMIN", "MANAGER", "MEMBER"] }),
  status: t.String({ description: "Account activity status", examples: ["Active", "Offline"] }),
  permissions: t.String({ description: "Bitmask permissions as numeric string", examples: ["65535"] }),
  joinedAt: t.Any({ description: "Date when user joined the organization" }),
  streamerAssignments: t.Array(
    t.Object({
      streamerId: t.String({ description: "Assigned streamer channel ID" }),
      permissions: t.Array(t.String({ description: "Assigned streamer permission key names" })),
    }),
  ),
  streamers: t.Array(
    t.Object({
      id: t.String({ description: "Streamer channel numeric ID" }),
      name: t.String({ description: "Channel handle" }),
      displayName: t.Nullable(t.String({ description: "Display name" })),
      avatar: t.Nullable(t.String({ description: "Avatar URL" })),
    }),
  ),
});

export const orgMemberUpdateResponseSchema = t.Object({
  id: t.String({ description: "Member ID", examples: ["1"] }),
  userId: t.String({ description: "User ID", examples: ["10"] }),
  role: t.String({ description: "Updated role", examples: ["MANAGER"] }),
  permissions: t.String({ description: "Updated bitmask permissions string", examples: ["1048575"] }),
  streamerAssignments: t.Optional(
    t.Array(
      t.Object({
        streamerId: t.String({ description: "Assigned streamer channel ID" }),
        permissions: t.Array(t.String()),
      }),
    ),
  ),
}, { description: "Updated member role, permissions, and streamer assignments" });

export const orgInviteSummarySchema = t.Object({
  id: t.String({ description: "Invitation record numeric ID", examples: ["1"] }),
  email: t.String({ description: "Recipient email", examples: ["invitee@example.com"] }),
  role: t.String({ description: "Assigned role upon joining", examples: ["MEMBER"] }),
  permissions: t.String({ description: "Assigned bitmask permissions string" }),
  token: t.String({ description: "8-digit invitation code or token", examples: ["12345678"] }),
  code: t.String({ description: "8-digit invitation code", examples: ["12345678"] }),
  expiresAt: t.Any({ description: "Expiration timestamp" }),
  createdAt: t.Any({ description: "Invitation creation timestamp" }),
});

export const orgInviteCreatedResponseSchema = t.Object({
  id: t.String({ description: "Invitation ID", examples: ["1"] }),
  email: t.String({ description: "Recipient email", examples: ["invitee@example.com"] }),
  role: t.String({ description: "Assigned role", examples: ["MEMBER"] }),
  code: t.String({ description: "8-digit invitation code", examples: ["12345678"] }),
  token: t.String({ description: "8-digit invitation code", examples: ["12345678"] }),
  expiresAt: t.Any({ description: "Expiration timestamp" }),
}, { description: "Created organization invitation with 8-digit code" });

export const orgInviteVerifyResponseSchema = t.Object({
  code: t.String({ description: "Verified 8-digit code", examples: ["12345678"] }),
  role: t.String({ description: "Role that will be granted", examples: ["MEMBER"] }),
  expiresAt: t.Any({ description: "Expiration timestamp" }),
  organization: t.Object({
    id: t.String({ description: "Organization ID", examples: ["1"] }),
    name: t.String({ description: "Organization name", examples: ["Acme Gaming"] }),
    slug: t.Nullable(t.String({ description: "Organization slug", examples: ["acme-gaming"] })),
    avatar: t.Nullable(t.String({ description: "Organization avatar URL" })),
    banner: t.Nullable(t.String({ description: "Organization banner URL" })),
  }),
  inviter: t.Object({
    name: t.Nullable(t.String({ description: "Name of user who sent the invite" })),
    avatar: t.Nullable(t.String({ description: "Avatar of user who sent the invite" })),
  }),
}, { description: "Verified invitation preview with organization and inviter metadata" });

export const orgInviteAcceptResponseSchema = t.Object({
  orgId: t.String({ description: "Organization ID joined", examples: ["1"] }),
  orgName: t.String({ description: "Organization name", examples: ["Acme Gaming"] }),
  orgSlug: t.Nullable(t.String({ description: "Organization slug", examples: ["acme-gaming"] })),
  role: t.String({ description: "Assigned member role", examples: ["MEMBER"] }),
}, { description: "Joined organization summary" });

export const orgAuditEntrySchema = t.Object({
  id: t.String({ description: "Audit log entry ID", examples: ["1"] }),
  orgId: t.String({ description: "Organization ID", examples: ["1"] }),
  action: t.String({ description: "Action key performed", examples: ["MEMBER_INVITED", "STREAMER_UPDATED"] }),
  targetType: t.String({ description: "Target entity type", examples: ["MEMBER", "STREAMER", "ORGANIZATION"] }),
  targetId: t.Nullable(t.String({ description: "Target entity ID", examples: ["10"] })),
  payload: t.Any({ description: "Structured audit change details or before/after diff" }),
  ipAddress: t.Nullable(t.String({ description: "Caller IP address", examples: ["127.0.0.1"] })),
  createdAt: t.String({ description: "ISO timestamp of event" }),
  user: t.Object({
    id: t.String({ description: "Actor user ID", examples: ["1"] }),
    name: t.Nullable(t.String({ description: "Actor user name", examples: ["John Doe"] })),
    email: t.String({ description: "Actor user email", examples: ["john@example.com"] }),
    avatar: t.Nullable(t.String({ description: "Actor user avatar URL" })),
  }),
});

export const orgAuditListResponseSchema = t.Object({
  total: t.Number({ description: "Total matching audit log events count", examples: [42] }),
  limit: t.Number({ description: "Query page limit", examples: [10] }),
  offset: t.Number({ description: "Query page offset", examples: [0] }),
  nextCursor: t.Optional(t.Nullable(t.String({ description: "Keyset pagination cursor" }))),
  logs: t.Array(orgAuditEntrySchema),
}, { description: "Paginated organization audit logs" });

export const orgActivityResponseSchema = t.Object({
  days: t.Array(
    t.Object({
      date: t.String({ description: "Date in YYYY-MM-DD format", examples: ["2026-11-21"] }),
      count: t.Number({ description: "Total transactions on this day", examples: [12] }),
      testCount: t.Number({ description: "Test transactions count", examples: [2] }),
      realCount: t.Number({ description: "Real production transactions count", examples: [10] }),
    }),
  ),
  totalCount: t.Number({ description: "Total transactions across all 365 days", examples: [1500] }),
  totalRealCount: t.Number({ description: "Total real revenue-bearing transactions", examples: [1450] }),
  totalTestCount: t.Number({ description: "Total simulated test transactions", examples: [50] }),
  maxCount: t.Number({ description: "Highest single-day transaction volume", examples: [45] }),
  busiestDay: t.Nullable(
    t.Object({
      date: t.String({ description: "YYYY-MM-DD" }),
      count: t.Number(),
      testCount: t.Number(),
      realCount: t.Number(),
    }),
  ),
  longestStreak: t.Number({ description: "Longest consecutive streak of active transaction days", examples: [14] }),
  longestStreakRange: t.Nullable(
    t.Object({
      start: t.String({ description: "Start date YYYY-MM-DD" }),
      end: t.String({ description: "End date YYYY-MM-DD" }),
    }),
  ),
  currentStreak: t.Number({ description: "Current active streak of transaction days", examples: [3] }),
  currentStreakRange: t.Nullable(
    t.Object({
      start: t.String({ description: "Start date YYYY-MM-DD" }),
      end: t.String({ description: "End date YYYY-MM-DD" }),
    }),
  ),
  startDate: t.String({ description: "Activity window start date YYYY-MM-DD" }),
  endDate: t.String({ description: "Activity window end date YYYY-MM-DD" }),
}, { description: "365-day organization transaction activity heatmap and streaks" });

export const orgAnalyticsResponseSchema = t.Object({
  timeframe: t.String({ description: "Selected analytics timeframe", examples: ["30d"] }),
  totals: t.Object({
    revenue: t.Number({ description: "Total real revenue in main currency units", examples: [12500.5] }),
    currency: t.String({ description: "Primary currency code", examples: ["THB"] }),
    transactions: t.Number({ description: "Total transaction count", examples: [250] }),
    realTransactions: t.Number({ description: "Real transaction count", examples: [240] }),
    testTransactions: t.Number({ description: "Test transaction count", examples: [10] }),
    activeGateways: t.Number({ description: "Count of payment gateways with volume", examples: [3] }),
    activeStreamers: t.Number({ description: "Count of channels in organization", examples: [2] }),
  }),
  currencies: t.Array(
    t.Object({
      currency: t.String({ description: "Currency code", examples: ["THB", "USD"] }),
      amount: t.Number({ description: "Total volume in currency units" }),
      count: t.Number({ description: "Transaction count in this currency" }),
      percentage: t.Number({ description: "Share of total organization volume (0-100)" }),
    }),
  ),
  gateways: t.Array(
    t.Object({
      provider: t.String({ description: "Payment provider identifier", examples: ["STRIPE", "BUYMEACOFFEE"] }),
      currency: t.String({ description: "Currency code" }),
      amount: t.Number({ description: "Total volume in currency units" }),
      count: t.Number({ description: "Transaction count" }),
      percentage: t.Number({ description: "Share of gateway volume (0-100)" }),
    }),
  ),
  streamers: t.Array(
    t.Object({
      id: t.String({ description: "Streamer channel numeric ID" }),
      name: t.String({ description: "Channel handle" }),
      displayName: t.Nullable(t.String({ description: "Display name" })),
      avatar: t.Nullable(t.String({ description: "Avatar URL" })),
      amount: t.Number({ description: "Total volume for channel" }),
      count: t.Number({ description: "Transaction count for channel" }),
      percentage: t.Number({ description: "Share of total volume (0-100)" }),
    }),
  ),
  timeline: t.Array(
    t.Object({
      date: t.String({ description: "YYYY-MM-DD" }),
      amount: t.Number({ description: "Volume on this day" }),
      count: t.Number({ description: "Total transactions" }),
      realCount: t.Number({ description: "Real transactions" }),
      testCount: t.Number({ description: "Test transactions" }),
    }),
  ),
}, { description: "Organization revenue, currency, gateway, streamer breakdown, and timeline" });

export const tinyUserResponseSchema = t.Object({
  id: t.String({ description: "User numeric ID", examples: ["10"] }),
  name: t.Nullable(t.String({ description: "User display name", examples: ["Jane Doe"] })),
  email: t.String({ description: "User email address", examples: ["jane@example.com"] }),
  avatar: t.Nullable(t.String({ description: "User avatar URL or CDN path" })),
}, { description: "Lightweight user profile" });
