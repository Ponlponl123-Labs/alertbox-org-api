import { OrgRole } from "@/generated/prisma/client";

/**
 * 64-bit bitmask flags for ultra-fast, zero-overhead permission checks.
 */
export const OrgPerm = {
  // 0-9: Organization Administration
  VIEW_ORG:              1n << 0n,
  MANAGE_SETTINGS:       1n << 1n,
  MANAGE_MEMBERS:        1n << 2n,
  MANAGE_ROLES:          1n << 3n,
  DELETE_ORG:            1n << 4n,

  // 10-19: Streamer & Profile Operations
  VIEW_STREAMERS:        1n << 10n,
  CREATE_STREAMER:       1n << 11n,
  EDIT_STREAMER_PROFILE: 1n << 12n,
  DELETE_STREAMER:       1n << 13n,

  // 20-29: Widgets & OBS Overlays
  VIEW_WIDGETS:          1n << 20n,
  MANAGE_ALERTBOX:       1n << 21n,
  ROTATE_WIDGET_TOKENS:  1n << 22n,

  // 30-39: Integrations & Payments
  VIEW_INTEGRATIONS:     1n << 30n,
  MANAGE_INTEGRATIONS:   1n << 31n,

  // 40-49: Financials, Analytics & Logs
  VIEW_ANALYTICS:        1n << 40n,
  VIEW_TRANSACTIONS:     1n << 41n,
  EXPORT_REPORTS:        1n << 42n,

  // Full Admin Mask
  ALL:                   18446744073709551615n, // 0xFFFFFFFFFFFFFFFF
} as const;

/**
 * Preset permission bitmasks for standard Organization roles.
 */
export const RolePresets: Record<OrgRole, bigint> = {
  OWNER: OrgPerm.ALL,
  ADMIN: OrgPerm.ALL & ~OrgPerm.DELETE_ORG,
  MANAGER:
    OrgPerm.VIEW_ORG |
    OrgPerm.VIEW_STREAMERS |
    OrgPerm.EDIT_STREAMER_PROFILE |
    OrgPerm.VIEW_WIDGETS |
    OrgPerm.MANAGE_ALERTBOX |
    OrgPerm.ROTATE_WIDGET_TOKENS |
    OrgPerm.VIEW_INTEGRATIONS |
    OrgPerm.MANAGE_INTEGRATIONS |
    OrgPerm.VIEW_ANALYTICS |
    OrgPerm.VIEW_TRANSACTIONS,
  EDITOR:
    OrgPerm.VIEW_ORG |
    OrgPerm.VIEW_STREAMERS |
    OrgPerm.EDIT_STREAMER_PROFILE |
    OrgPerm.VIEW_WIDGETS |
    OrgPerm.MANAGE_ALERTBOX,
  VIEWER:
    OrgPerm.VIEW_ORG |
    OrgPerm.VIEW_STREAMERS |
    OrgPerm.VIEW_WIDGETS |
    OrgPerm.VIEW_ANALYTICS,
  MEMBER: OrgPerm.VIEW_ORG,
};

/**
 * Checks whether userPerms contains ALL required permissions. (0ns overhead)
 */
export function hasPermission(userPerms: bigint, required: bigint): boolean {
  return (userPerms & required) === required;
}

/**
 * Checks whether userPerms contains AT LEAST ONE of the required permissions.
 */
export function hasAnyPermission(userPerms: bigint, required: bigint): boolean {
  return (userPerms & required) !== 0n;
}

/**
 * Combine multiple permission bits into a single bitmask.
 */
export function combinePermissions(...perms: bigint[]): bigint {
  return perms.reduce((acc, p) => acc | p, 0n);
}

/**
 * Remove specific permission bits from a bitmask.
 */
export function removePermissions(perms: bigint, ...toRemove: bigint[]): bigint {
  const mask = toRemove.reduce((acc, p) => acc | p, 0n);
  return perms & ~mask;
}
