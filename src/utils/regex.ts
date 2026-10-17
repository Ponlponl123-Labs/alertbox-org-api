import { reserved_uri } from "@/consts/reserved";
import { allowed_uri, allowed_social } from "@/consts/regex";

export function isValidUri(input: string): boolean {
  return allowed_uri.test(input) && !reserved_uri.has(input);
}

export function isValidSocial(input: string): boolean {
  return allowed_social.test(input.trim());
}
