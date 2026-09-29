import { reserved_uri } from "@/consts/reserved";

export const allowed_uri = /^[a-z0-9_]+$/;
export const allowed_chars = /^\w+$/;
export const allowed_social = /^@?[a-zA-Z0-9_.-]{1,64}$/;
export const allowed_hex_color = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isValidUri(input: string): boolean {
  return allowed_uri.test(input) && !reserved_uri.has(input);
}

export function isValidSocial(input: string): boolean {
  return allowed_social.test(input.trim());
}
