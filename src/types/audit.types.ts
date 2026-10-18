export type OrgAuditTargetType = "MEMBER" | "STREAMER" | "ORGANIZATION";

export interface LogOrgAuditParams {
  orgId: bigint;
  userId: bigint;
  action: string;
  targetType: OrgAuditTargetType;
  targetId?: bigint;
  payload?: any;
  ipAddress?: string;
}

export interface OrgAuditUser {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
}

export interface OrgAuditLogItem {
  id: string;
  orgId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  payload: unknown;
  ipAddress: string;
  createdAt: string;
  user: OrgAuditUser;
}

export interface OrgAuditLogsResponse {
  total: number;
  limit: number;
  offset: number;
  logs: OrgAuditLogItem[];
}
