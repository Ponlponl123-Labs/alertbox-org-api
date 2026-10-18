import { OrgRole } from "@/db/enums";

/**
 * 64-bit bitmask flags for ultra-fast, zero-overhead permission checks.
 * Standard Domain-Scoped Bitwise hierarchy: RESOURCE_ACTION.
 */
export const OrgPerm = {
  // 0-9: Organization Management
  ORG_VIEW:                  1n << 0n,
  ORG_MANAGE:                1n << 1n,
  ORG_MEMBER_ADD:            1n << 2n,
  ORG_MEMBER_MODIFY:         1n << 3n,
  ORG_MEMBER_REMOVE:         1n << 4n,
  ORG_ROLES_MANAGE:          1n << 5n,
  ORG_DELETE:                1n << 6n,

  // Composite Member Management mask for compatibility
  ORG_MEMBERS_MANAGE:        (1n << 2n) | (1n << 3n) | (1n << 4n),

  // 10-19: Streamer Channels Management
  STREAMER_VIEW:             1n << 10n,
  STREAMER_CREATE:           1n << 11n,
  STREAMER_MANAGE:           1n << 12n,
  STREAMER_DELETE:           1n << 13n,

  // 20-29: Widgets & OBS Overlays
  WIDGET_VIEW:               1n << 20n,
  WIDGET_MANAGE:             1n << 21n,
  WIDGET_TOKEN_ROTATE:       1n << 22n,

  // 30-39: Integrations & Payments
  INTEGRATION_VIEW:          1n << 30n,
  INTEGRATION_MANAGE:        1n << 31n,

  // 40-49: Financials, Analytics & Logs
  ANALYTICS_VIEW:            1n << 40n,
  TRANSACTION_VIEW:          1n << 41n,
  REPORT_EXPORT:             1n << 42n,

  // Full Admin Mask
  ALL:                       18446744073709551615n, // 0xFFFFFFFFFFFFFFFF
} as const;

/**
 * Preset permission bitmasks for standard Organization roles.
 */
export const RolePresets: Record<OrgRole, bigint> = {
  OWNER: OrgPerm.ALL,
  ADMIN: OrgPerm.ALL & ~OrgPerm.ORG_DELETE,
  MANAGER:
    OrgPerm.ORG_VIEW |
    OrgPerm.STREAMER_VIEW |
    OrgPerm.STREAMER_MANAGE |
    OrgPerm.WIDGET_VIEW |
    OrgPerm.WIDGET_MANAGE |
    OrgPerm.WIDGET_TOKEN_ROTATE |
    OrgPerm.INTEGRATION_VIEW |
    OrgPerm.INTEGRATION_MANAGE |
    OrgPerm.ANALYTICS_VIEW |
    OrgPerm.TRANSACTION_VIEW,
  EDITOR:
    OrgPerm.ORG_VIEW |
    OrgPerm.STREAMER_VIEW |
    OrgPerm.STREAMER_MANAGE |
    OrgPerm.WIDGET_VIEW |
    OrgPerm.WIDGET_MANAGE,
  VIEWER:
    OrgPerm.ORG_VIEW |
    OrgPerm.STREAMER_VIEW |
    OrgPerm.WIDGET_VIEW |
    OrgPerm.ANALYTICS_VIEW,
  MEMBER: OrgPerm.ORG_VIEW,
};

/**
 * Bitwise flags for granular channel/streamer level delegations.
 */
export const StreamerPerm = {
  STREAMER_VIEW:               1 << 0, // 1
  STREAMER_MANAGE:             1 << 1, // 2
  STREAMER_WIDGET_MANAGE:      1 << 2, // 4
  STREAMER_INTEGRATION_MANAGE: 1 << 3, // 8
  STREAMER_ANALYTICS_VIEW:     1 << 4, // 16
  STREAMER_TRANSACTION_VIEW:   1 << 5, // 32

  ALL:                         63,     // 0b111111
} as const;

/**
 * Metadata definition catalogue for organization-scoped bitmask permissions.
 */
export const PERMISSION_DEFINITIONS = [
  // 0-9: Organization Management
  {
    key: "ORG_VIEW",
    name: "View Organization",
    category: "Organization Administration",
    description: "View organization profile, member list, and activity overview.",
    bitmask: OrgPerm.ORG_VIEW.toString(),
  },
  {
    key: "ORG_MANAGE",
    name: "Manage Settings",
    category: "Organization Administration",
    description: "Update organization name, custom slug, avatar, and billing profile.",
    bitmask: OrgPerm.ORG_MANAGE.toString(),
  },
  {
    key: "ORG_MEMBER_ADD",
    name: "Invite Members",
    category: "Organization Administration",
    description: "Invite new team members and generate 8-digit OTP join codes.",
    bitmask: OrgPerm.ORG_MEMBER_ADD.toString(),
  },
  {
    key: "ORG_MEMBER_MODIFY",
    name: "Modify Member Permissions",
    category: "Organization Administration",
    description: "Update member roles, assign streamer channel access, and alter permissions.",
    bitmask: OrgPerm.ORG_MEMBER_MODIFY.toString(),
  },
  {
    key: "ORG_MEMBER_REMOVE",
    name: "Remove Members",
    category: "Organization Administration",
    description: "Remove team members from the organization and revoke pending invitations.",
    bitmask: OrgPerm.ORG_MEMBER_REMOVE.toString(),
  },
  {
    key: "ORG_ROLES_MANAGE",
    name: "Manage Roles & Permissions",
    category: "Organization Administration",
    description: "Create custom permission presets and reassign staff capabilities.",
    bitmask: OrgPerm.ORG_ROLES_MANAGE.toString(),
  },
  {
    key: "ORG_DELETE",
    name: "Delete Organization",
    category: "Organization Administration",
    description: "Permanently delete the organization and all attached streamer channels.",
    bitmask: OrgPerm.ORG_DELETE.toString(),
  },

  // 10-19: Streamer Channels Management
  {
    key: "STREAMER_VIEW",
    name: "View Streamer Channels",
    category: "Streamer Channels",
    description: "View channel profiles, donation handles, and social links.",
    bitmask: OrgPerm.STREAMER_VIEW.toString(),
  },
  {
    key: "STREAMER_CREATE",
    name: "Create Channel",
    category: "Streamer Channels",
    description: "Provision new streamer channel handles under this organization.",
    bitmask: OrgPerm.STREAMER_CREATE.toString(),
  },
  {
    key: "STREAMER_MANAGE",
    name: "Edit Channel Profile",
    category: "Streamer Channels",
    description: "Edit display name, bio, avatar, banner, and social media handles.",
    bitmask: OrgPerm.STREAMER_MANAGE.toString(),
  },
  {
    key: "STREAMER_DELETE",
    name: "Delete Channel",
    category: "Streamer Channels",
    description: "Soft-delete streamer channels and archive their public pages.",
    bitmask: OrgPerm.STREAMER_DELETE.toString(),
  },

  // 20-29: Widgets & OBS Overlays
  {
    key: "WIDGET_VIEW",
    name: "View Widgets",
    category: "Widgets & Overlays",
    description: "View OBS browser source URLs and widget tokens.",
    bitmask: OrgPerm.WIDGET_VIEW.toString(),
  },
  {
    key: "WIDGET_MANAGE",
    name: "Manage AlertBox",
    category: "Widgets & Overlays",
    description: "Customize alert templates, sounds, animations, and typography.",
    bitmask: OrgPerm.WIDGET_MANAGE.toString(),
  },
  {
    key: "WIDGET_TOKEN_ROTATE",
    name: "Rotate Widget Tokens",
    category: "Widgets & Overlays",
    description: "Regenerate compromised browser source URLs and cryptographic tokens.",
    bitmask: OrgPerm.WIDGET_TOKEN_ROTATE.toString(),
  },

  // 30-39: Integrations & Payments
  {
    key: "INTEGRATION_VIEW",
    name: "View Integrations",
    category: "Integrations & Gateways",
    description: "View payment connection statuses (Streamlabs, BMAC, Ko-fi).",
    bitmask: OrgPerm.INTEGRATION_VIEW.toString(),
  },
  {
    key: "INTEGRATION_MANAGE",
    name: "Manage Integrations",
    category: "Integrations & Gateways",
    description: "Connect or disconnect external payment relays and webhooks.",
    bitmask: OrgPerm.INTEGRATION_MANAGE.toString(),
  },

  // 40-49: Financials, Analytics & Logs
  {
    key: "ANALYTICS_VIEW",
    name: "View Analytics",
    category: "Analytics & Finance",
    description: "Access supporter metrics, tip velocity, and real-time graphs.",
    bitmask: OrgPerm.ANALYTICS_VIEW.toString(),
  },
  {
    key: "TRANSACTION_VIEW",
    name: "View Transactions",
    category: "Analytics & Finance",
    description: "Inspect raw donation logs, supporter notes, and payment amounts.",
    bitmask: OrgPerm.TRANSACTION_VIEW.toString(),
  },
  {
    key: "REPORT_EXPORT",
    name: "Export Financial Reports",
    category: "Analytics & Finance",
    description: "Export audit logs, donation CSVs, and revenue summaries.",
    bitmask: OrgPerm.REPORT_EXPORT.toString(),
  },
] as const;

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  OWNER: "Full organization authority, financial control, and destruction rights.",
  ADMIN: "Administrative access across members, settings, and channels (cannot delete org).",
  MANAGER: "Operational authority over streamer profiles, widgets, alerts, and integrations.",
  EDITOR: "Creative authority to customize channel profiles and AlertBox visuals.",
  VIEWER: "Read-only visibility for auditing, analytics, and overlay previews.",
  MEMBER: "Standard team member with basic organization directory access.",
};

// Precomputed static system presets to avoid per-request iteration and bitmask allocations
export const SYSTEM_PRESETS = Object.entries(RolePresets).map(([role, mask]) => {
  const roleName = role.charAt(0) + role.slice(1).toLowerCase();

  const grantedKeys = PERMISSION_DEFINITIONS.filter(
    (def) => (mask & BigInt(def.bitmask)) === BigInt(def.bitmask),
  ).map((def) => def.key);

  return {
    id: role,
    name: roleName,
    role: role as OrgRole,
    description: ROLE_DESCRIPTIONS[role] ?? `${roleName} role with default permissions.`,
    permissions: mask.toString(),
    grantedKeys,
    isSystem: true,
  };
});
