export interface User {
  id: bigint;
  name: string;
  displayname: string;
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
