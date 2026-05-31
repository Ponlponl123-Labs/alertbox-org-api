export function isBearerToken(auth: string): string | false {
  const split = auth.split(" ");
  if (split[0] === "Bearer") return split[1];
  return false;
}
