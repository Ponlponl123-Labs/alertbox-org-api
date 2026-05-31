export interface DiscordAuth {
  type: string;
  token: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string;
  avatar?: string;
  banner?: string;
  bot?: boolean;
  accent_color?: number;
  locale?: string;
  verified?: boolean;
  email?: string;
  flags?: number;
  premium_type?: number;
  public_flags?: number;
}
