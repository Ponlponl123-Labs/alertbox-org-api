export const OrgRole = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MANAGER: "MANAGER",
  EDITOR: "EDITOR",
  VIEWER: "VIEWER",
  MEMBER: "MEMBER",
} as const;
export type OrgRole = (typeof OrgRole)[keyof typeof OrgRole];

export const UserType = {
  REGULAR: "REGULAR",
  SUPPORTER: "SUPPORTER",
  OPERATOR: "OPERATOR",
} as const;
export type UserType = (typeof UserType)[keyof typeof UserType];

export const OrgType = {
  COMMUNITY: "COMMUNITY",
  ENTERPRISE: "ENTERPRISE",
} as const;
export type OrgType = (typeof OrgType)[keyof typeof OrgType];

export const WidgetType = {
  ALERTBOX: "ALERTBOX",
  TIPJAR: "TIPJAR",
  GOALBAR: "GOALBAR",
} as const;
export type WidgetType = (typeof WidgetType)[keyof typeof WidgetType];

export const AlertEventType = {
  TIP: "TIP",
  MEMBERSHIP: "MEMBERSHIP",
  MERCH: "MERCH",
  FOLLOW: "FOLLOW",
} as const;
export type AlertEventType = (typeof AlertEventType)[keyof typeof AlertEventType];

export const TransactionStatus = {
  PENDING: "PENDING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  REFUNDED: "REFUNDED",
} as const;
export type TransactionStatus = (typeof TransactionStatus)[keyof typeof TransactionStatus];
