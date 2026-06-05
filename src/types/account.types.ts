export interface User {
  id: string;
  email: string;
  createWith: string;
  createdAt: Date;
  updatedAt: Date;
  disabledAt: Date | null;
  deletedAt: Date | null;
}

export interface UserCreated {
  id: string;
  secret: string;
}

export interface MinimalUser {
  id: string;
  disabledAt: Date | null;
  deletedAt: Date | null;
}

export interface Connections {
  stripe: string | null;
  bmac: string | null;
  kofi: string | null;
  ffp: string | null;
  youtube: string | null;
  facebook: string | null;
  twitch: string | null;
  patreon: string | null;
  streamlabs: boolean;
}
