import { Prisma } from "@/generated/prisma/client";

export const sessionUserSelect = {
  id: true,
  name: true,
  displayname: true,
  uri: true,
  email: true,
  avatar: true,
  banner: true,
  disabled: true,
  deleted: true,
  bmac_secret: true,
  create_with: true,
  ffp_secret: true,
  kofi_secret: true,
  stripe_secret: true,
  time: true,
  uri_cooldown: true,
  bio: true,
  published: true,
  secret: false,
} as const satisfies Prisma.accountsSelect;
