import { OrgRole } from "@/db/enums";

export interface RolePresetData {
  id: string;
  name: string;
  description: string | null;
  permissions: string;
  color?: string | null;
  createdAt: string;
}

export interface OrgMemberItem {
  id: string;
  userId: string;
  role: OrgRole;
  permissions: string;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    name: string | null;
    avatar: string | null;
    joinedAt: Date;
  };
  assignedStreamers: Array<{
    id: string;
    name: string;
    displayName: string;
    avatar: string | null;
  }>;
}

export interface OrgInviteData {
  id: string;
  email: string;
  role: OrgRole;
  code: string;
  token: string;
  expiresAt: Date;
}

export interface OrgActivityDay {
  date: string;
  count: number;
  testCount?: number;
  realCount?: number;
}

export interface OrgActivityResponse {
  days: OrgActivityDay[];
  totalCount: number;
  totalRealCount?: number;
  totalTestCount?: number;
  maxCount: number;
  busiestDay: OrgActivityDay | null;
  longestStreak: number;
  longestStreakRange: { start: string; end: string } | null;
  currentStreak: number;
  currentStreakRange: { start: string; end: string } | null;
  startDate: string;
  endDate: string;
}

