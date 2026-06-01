import type { Prisma } from "@/generated/prisma/client";

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

export type BaseSessionSelect = {
  id: true;
  create_with: true;
  time: true;
  name: true;
  email: true;
  displayname: true;
  uri: true;
  avatar: true;
  banner: true;
  deleted: true;
  disabled: true;
  secret: false;
};

export type SessionUser<S extends Prisma.accountsSelect | undefined> =
  Prisma.accountsGetPayload<{
    select: S extends Prisma.accountsSelect
      ? S & BaseSessionSelect
      : BaseSessionSelect;
  }>;

export interface Connections {
  stripe: string | null;
  bmac: string | null;
  kofi: string | null;
  ffp: string | null;
}
