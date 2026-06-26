/**
 * Bitmask flags representing profile badges.
 */
export const PROFILE_BADGES = {
  VERIFIED: 1 << 0,   // 1
  STAFF: 1 << 1,      // 2
  EARLY_USER: 1 << 2, // 4
} as const;

/**
 * Bitmask flags representing profile options.
 * Currently unused, reserved for future settings.
 */
export const PROFILE_OPTIONS = {
  // Reserved for future options
} as const;
