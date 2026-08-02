/**
 * Utility functions for Streamlabs API integration.
 */

/**
 * Formats and sanitizes a donor/supporter name to conform to Streamlabs API requirements.
 * Streamlabs requires donor names to be between 2 and 25 characters and contain only
 * letters, numbers, spaces, and underscores.
 *
 * This function supports UTF-8 letters (\p{L}) and numbers (\p{N}), stripping out invalid
 * symbols and emojis while handling multi-byte code points safely.
 *
 * @param name - The raw donor or supporter name.
 * @returns A sanitized name string guaranteed to satisfy Streamlabs API constraints (2-25 characters).
 */
export function formatStreamlabsName(name?: string | null): string {
  if (!name) {
    return "Anonymous";
  }

  // Remove any character that is not a Unicode letter (\p{L}), Unicode number (\p{N}), space, or underscore
  const cleaned = name
    .replace(/[^\p{L}\p{N} _]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  // Safely convert to array of code points to handle multi-byte UTF-8 characters
  const chars = Array.from(cleaned);

  if (chars.length < 2) {
    return "Anonymous";
  }

  if (chars.length > 25) {
    const truncated = chars.slice(0, 25).join("").trim();
    if (Array.from(truncated).length < 2) {
      return "Anonymous";
    }
    return truncated;
  }

  return cleaned;
}
