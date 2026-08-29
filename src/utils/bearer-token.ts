export function isBearerToken(auth: string): string | false {
  if (!auth || typeof auth !== "string") return false;
  const parts = auth.trim().split(/\s+/);
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer" && parts[1]) {
    return parts[1];
  }
  return false;
}
