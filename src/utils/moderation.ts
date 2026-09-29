/**
 * Normalizes input text to unmask leetspeak and common evasion techniques (Thai & English).
 */
export function normalizeModerationText(raw: string): string {
  let s = raw.toLowerCase();

  // Thai symbol/space bypass unmasking
  s = s.replace(/ค[_.\-\s]+ย/g, "ควย");
  s = s.replace(/เ[_.\-\s]+ด/g, "เย็ด");
  s = s.replace(/เหี้[_.\-\s]+ย/g, "เหี้ย");
  s = s.replace(/สั[_.\-\s]+ส/g, "สัส");

  // English leetspeak and obfuscated slurs
  s = s.replace(/f[4a@][gq9]{1,2}[0o]t?5?/g, "faggot");
  s = s.replace(/n[i1!|][gq9]{1,2}[e3a@]r?/g, "nigger");
  s = s.replace(/b[i1!|]tch/g, "bitch");

  return s;
}

/**
 * Splits text into bounded sentence chunks to prevent semantic vector dilution.
 */
export function splitModerationChunks(text: string, maxChunks = 8): string[] {
  const bounded = text.slice(0, 4000);
  const clauses = bounded
    .split(/(?<=[.!?\n])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  return [bounded, ...clauses].slice(0, maxChunks);
}
