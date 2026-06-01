export const allowed_uri = /^[a-z0-9_]+$/;
export const allowed_chars = /^\w+$/;

export function isValidUri(input: string): boolean {
  return allowed_uri.test(input);
}
