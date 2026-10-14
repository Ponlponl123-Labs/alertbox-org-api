import { SupportedProvider } from "@/consts/providers";

export type { SupportedProvider };

export interface StreamerProfilePayload {
  displayname?: string;
  displayName?: string;
  name?: string;
  bio?: string | null;
  accentColor?: string | null;
  socialDiscord?: string | null;
  socialFacebook?: string | null;
  socialReddit?: string | null;
  socialTwitch?: string | null;
  socialTwitter?: string | null;
  socialYoutube?: string | null;
  avatar?: File;
  banner?: File;
}

export type ConnectionSecretPayload =
  | string
  | { username?: string | null; secret: string; refreshToken?: string | null };
