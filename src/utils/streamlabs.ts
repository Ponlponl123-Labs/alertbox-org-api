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
 * If all characters are invalid, or if the resulting name is invalid (e.g. < 2 characters or > 25 characters),
 * it safely falls back to "Anonymous".
 *
 * @param name - The raw donor or supporter name.
 * @returns A sanitized name string guaranteed to satisfy Streamlabs API constraints (2-25 characters).
 */
export function formatStreamlabsName(name?: string | null): string {
  const fallback = "Anonymous";

  if (!name) {
    return fallback;
  }

  // Remove any character that is not a Unicode letter (\p{L}), Unicode number (\p{N}), space, or underscore
  const cleaned = name
    .replace(/[^\p{L}\p{N} _]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  // Safely convert to array of code points to handle multi-byte UTF-8 characters
  const chars = Array.from(cleaned);

  // If all characters were invalid or result is less than 2 characters
  if (chars.length < 2) {
    return fallback;
  }

  let finalName = cleaned;
  if (chars.length > 25) {
    finalName = chars.slice(0, 25).join("").trim();
  }

  // Final validation check to guarantee the output conforms to Streamlabs constraints
  const isValid = /^[\p{L}\p{N} _]{2,25}$/u.test(finalName);
  return isValid ? finalName : fallback;
}
