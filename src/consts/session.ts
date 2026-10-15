import { Prisma } from "@/generated/prisma/client";

/**
 * Minimal selection for presence checks.
 */
export const basicUserSelect = {
  id: true,
} as const satisfies Prisma.UserSelect;

/**
 * Pure user scalar attributes for lightweight, isolated user cache.
 */
export const pureUserSelect = {
  id: true,
  type: true,
  email: true,
  name: true,
  avatar: true,
  createWith: true,
  createdAt: true,
  disabledAt: true,
  deletedAt: true,
} as const satisfies Prisma.UserSelect;

/**
 * Selection for full user data including organizations and streamers.
 */
export const sessionUserSelect = {
  id: true,
  type: true,
  email: true,
  name: true,
  avatar: true,
  createWith: true,
  createdAt: true,
  disabledAt: true,
  deletedAt: true,
  memberships: {
    include: {
      organization: {
        include: {
          streamers: {
            include: {
              widgets: {
                include: {
                  alertbox: {
                    include: {
                      events: true,
                    },
                  },
                },
              },
              integration: true,
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.UserSelect;

/**
 * Full user selection containing all details and nested relations for master caching.
 */
export const fullUserSelect = {
  id: true,
  type: true,
  email: true,
  name: true,
  avatar: true,
  createWith: true,
  createdAt: true,
  disabledAt: true,
  deletedAt: true,
  memberships: {
    include: {
      organization: {
        include: {
          streamers: {
            include: {
              widgets: {
                include: {
                  alertbox: {
                    include: {
                      events: true,
                    },
                  },
                },
              },
              integration: true,
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.UserSelect;

export const sessionUserInclude = {
  memberships: {
    include: {
      organization: {
        include: {
          streamers: true,
        },
      },
    },
  },
} as const satisfies Prisma.UserInclude;

export const fullUserInclude = {
  memberships: {
    include: {
      organization: {
        include: {
          streamers: {
            include: {
              widgets: {
                include: {
                  alertbox: {
                    include: {
                      events: true,
                    },
                  },
                },
              },
              integration: true,
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.UserInclude;
