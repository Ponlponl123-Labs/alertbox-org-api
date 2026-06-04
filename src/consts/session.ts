import { Prisma } from "@/generated/prisma/client";

/**
 * Selection for full user data including profile and widgets.
 */
export const sessionUserSelect = {
  id: true,
  email: true,
  createWith: true,
  createdAt: true,
  disabledAt: true,
  deletedAt: true,
  profile: true,
  widgets: {
    include: {
      alertbox: {
        include: {
          events: true,
        },
      },
    },
  },
} as const satisfies Prisma.UserSelect;

/**
 * Minimal selection for presence checks.
 */
export const basicUserSelect = {
  id: true,
} as const satisfies Prisma.UserSelect;

/**
 * Selection for integration secrets.
 */
export const integrationSelect = {
  id: true,
  integration: true,
} as const satisfies Prisma.UserSelect;
