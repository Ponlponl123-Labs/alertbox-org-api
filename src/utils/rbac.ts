import { StreamerPerm } from "@/consts/permission";

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
