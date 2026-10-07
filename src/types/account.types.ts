export interface User {
  id: bigint;
  email: string;
  createWith: string;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
  deletedAt: Date | null;
}

export interface UserCreated {
  id: bigint;
  secret: string;
}

export interface MinimalUser {
  id: bigint;
  disabledAt: Date | null;
  deletedAt: Date | null;
}

export interface Connections {
  stripe: string | null;
  bmac: { username: string; secret: string } | null;
  kofi: { username: string; secret: string } | null;
  xendit: string | null;
  ffp: string | null;
  youtube: string | null;
  facebook: string | null;
  twitch: string | null;
  patreon: string | null;
  streamlabs: boolean;
}
