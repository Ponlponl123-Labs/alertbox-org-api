import { OrgRole } from "@/generated/prisma/client";

/**
 * 64-bit bitmask flags for ultra-fast, zero-overhead permission checks.
 * Standard Domain-Scoped Bitwise hierarchy: RESOURCE_ACTION.
 */
export const OrgPerm = {
  // 0-9: Organization Management
  ORG_VIEW:                  1n << 0n,
  ORG_MANAGE:                1n << 1n,
  ORG_MEMBERS_MANAGE:        1n << 2n,
  ORG_ROLES_MANAGE:          1n << 3n,
  ORG_DELETE:                1n << 4n,

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
 * Normalizes channel permission representations (number bitmask, string, or legacy array) into a bitwise integer.
 */
export function parseStreamerPermissions(perms: unknown): number {
  if (typeof perms === "number") return perms;
  if (typeof perms === "string") {
    const num = Number(perms);
    if (!isNaN(num)) return num;
    if (perms in StreamerPerm) return (StreamerPerm as any)[perms];
  }
  if (Array.isArray(perms)) {
    return perms.reduce<number>((acc, p) => {
      if (typeof p === "number") return acc | p;
      if (typeof p === "string") {
        if (!isNaN(Number(p))) return acc | Number(p);
        if (p === "READ_STREAMER_BASIC" || p === "STREAMER_VIEW") return acc | StreamerPerm.STREAMER_VIEW;
        if (p === "WRITE_STREAMER_BASIC" || p === "STREAMER_MANAGE") return acc | StreamerPerm.STREAMER_MANAGE;
        if (p === "MANAGE_STREAMER_WIDGETS" || p === "STREAMER_WIDGET_MANAGE") return acc | StreamerPerm.STREAMER_WIDGET_MANAGE;
        if (p === "MANAGE_STREAMER_INTEGRATIONS" || p === "STREAMER_INTEGRATION_MANAGE") return acc | StreamerPerm.STREAMER_INTEGRATION_MANAGE;
        if (p === "READ_STREAMER_ANALISTIC" || p === "STREAMER_ANALYTICS_VIEW") return acc | StreamerPerm.STREAMER_ANALYTICS_VIEW;
        if (p === "READ_STREAMER_TRANSACTION" || p === "STREAMER_TRANSACTION_VIEW") return acc | StreamerPerm.STREAMER_TRANSACTION_VIEW;
      }
      return acc;
    }, 0);
  }
  return 0;
}

export function hasStreamerPermission(userPerms: number, required: number): boolean {
  return (userPerms & required) === required;
}
