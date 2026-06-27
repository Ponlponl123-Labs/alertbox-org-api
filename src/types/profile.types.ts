import { PROFILE_BADGES } from "@/consts/profile";

/**
 * Valid profile badge names.
 */
export type ProfileBadgeName = "verified" | "staff" | "early_user" | "partner";

/**
 * Resolves active badge names from a flags integer.
 * 
 * @param flags - The profile badges bitmask.
 * @returns Array of active badge names.
 */
export function getActiveBadges(flags: number): ProfileBadgeName[] {
  const active: ProfileBadgeName[] = [];
  if (flags & PROFILE_BADGES.VERIFIED) active.push("verified");
  if (flags & PROFILE_BADGES.STAFF) active.push("staff");
  if (flags & PROFILE_BADGES.EARLY_USER) active.push("early_user");
  if (flags & PROFILE_BADGES.PARTNER) active.push("partner");
  return active;
}
