import type { accounts } from "@/generated/prisma/client";

export interface User {
  id: bigint;
  name: string;
  displayname: string;
  uri: string;
  email: string;
  avatar: string | null;
  banner: string | null;
  disabled: Date | null;
  deleted: Date | null;
}

export interface UserCreated {
  id: bigint;
  secret: string;
}

export interface MinimalUser {
  id: bigint;
  disabled: Date | null;
  deleted: Date | null;
}

export type SessionUser = Omit<
  accounts,
  | "secret"
  | "stripe_secret"
  | "bmac_secret"
  | "kofi_secret"
  | "ffp_secret"
  | "streamlabs_secret"
>;

export interface Connections {
  stripe: string | null;
  bmac: string | null;
  kofi: string | null;
  ffp: string | null;
  youtube: string | null;
  facebook: string | null;
  twitch: string | null;
  patreon: string | null;
  streamlabs: string | null;
}
