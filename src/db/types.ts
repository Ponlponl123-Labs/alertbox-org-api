import type { Generated } from "kysely";
import type {
  OrgRole,
  UserType,
  OrgType,
  WidgetType,
  AlertEventType,
  TransactionStatus,
} from "./enums";

export interface User {
  id: Generated<bigint | number>;
  email: string;
  type: Generated<UserType>;
  createWith: string;
  secret: string;
  name: string | null;
  displayName: string | null;
  avatar: string | null;
  disabledAt: Date | string | null;
  deletedAt: Date | string | null;
  createdAt: Generated<Date | string>;
  updatedAt: Generated<Date | string>;
}

export interface Organization {
  id: Generated<bigint | number>;
  type: Generated<OrgType>;
  slug: string;
  name: string;
  avatar: string | null;
  banner: string | null;
  ownerId: bigint | number;
  createBy: Generated<bigint | number>;
  deletedAt: Date | string | null;
  createdAt: Generated<Date | string>;
  updatedAt: Generated<Date | string>;
}

export interface OrganizationMember {
  id: Generated<bigint | number>;
  orgId: bigint | number;
  userId: bigint | number;
  role: Generated<OrgRole>;
  permissions: Generated<bigint | number>;
  isDeleted: Date | string | null;
  createdAt: Generated<Date | string>;
  updatedAt: Generated<Date | string>;
}

export interface OrganizationInvite {
  id: Generated<bigint | number>;
  orgId: bigint | number;
  email: string;
  role: Generated<OrgRole>;
  permissions: Generated<bigint | number>;
  token: string;
  inviterId: bigint | number;
  expiresAt: Date | string;
  acceptedAt: Date | string | null;
  createdAt: Generated<Date | string>;
}

export interface OrganizationRolePreset {
  id: Generated<bigint | number>;
  orgId: bigint | number;
  name: string;
  description: string | null;
  permissions: Generated<bigint | number>;
  color: string | null;
  createdAt: Generated<Date | string>;
  updatedAt: Generated<Date | string>;
}

export interface OrganizationAuditLog {
  id: Generated<bigint | number>;
  orgId: bigint | number;
  userId: bigint | number;
  action: string;
  targetType: string;
  targetId: bigint | number | null;
  payload: string | null;
  ipAddress: string;
  createdAt: Generated<Date | string>;
}

export interface Streamer {
  id: Generated<bigint | number>;
  orgId: bigint | number;
  name: string;
  displayName: string;
  bio: string | null;
  avatar: string | null;
  banner: string | null;
  options: Generated<number>;
  badges: Generated<number>;
  accentColor: Generated<number>;
  uri: string | null;
  uriCooldownEnd: Date | string | null;
  publishedAt: Date | string | null;
  twitch: string | null;
  youtube: string | null;
  twitter: string | null;
  facebook: string | null;
  reddit: string | null;
  discord: string | null;
  defaultDonorName: Generated<string>;
  defaultDonorAmount: Generated<bigint | number>;
  defaultDonorAvatar: string | null;
  isDonorCanCustomAvatar: Generated<Date | string | null>;
  currency: number | null;
  minTipAmount: Generated<bigint | number>;
  maxTipAmount: Generated<bigint | number>;
  deletedAt: Date | string | null;
  createdAt: Generated<Date | string>;
  updatedAt: Generated<Date | string>;
}

export interface Widget {
  id: Generated<bigint | number>;
  orgId?: bigint | number;
  streamerId: bigint | number;
  type: WidgetType;
  token: string;
  tokenCooldownEnd?: Date | string | null;
  deletedAt: Date | string | null;
  createdAt: Generated<Date | string>;
  updatedAt: Generated<Date | string>;
}

export interface AlertboxSetting {
  id: Generated<bigint | number>;
  widgetId: bigint | number;
  globalVolume: Generated<number | null>;
}

export interface AlertboxEvent {
  id: Generated<bigint | number>;
  alertboxId: bigint | number;
  eventType: AlertEventType;
  isEnabled: Generated<number | boolean>;
  messageLayout: number | null;
  minVisibleDuration: number | null;
  image: string | null;
  sound: string | null;
  soundVolume: number | null;
  fontFamily: number | null;
  fontSize: Generated<number>;
  fontWeight: Generated<number>;
  textColor: Generated<number>;
  amountColor: Generated<number>;
  donorColor: Generated<number>;
  outlineColor: Generated<number>;
  outlineSize: Generated<number>;
  textShadowColor: Generated<number>;
  textShadowSize: Generated<number>;
  accentColor: Generated<number>;
  prefix: string | null;
  subfix: string | null;
  subfixColor: Generated<number>;
  animIn: number | null;
  animInDuration: number | null;
  animOut: number | null;
  animOutDuration: number | null;
  ttsEnabled: Generated<number | boolean>;
  ttsVoice: number | null;
  ttsSpeed: number | null;
  ttsPitch: number | null;
  ttsVolume: number | null;
  ttsDelay: number | null;
  ttsMinTip: Generated<bigint | number>;
  ttsOptions: Generated<number>;
  updatedAt: Generated<Date | string>;
}

export interface Integration {
  id: Generated<bigint | number>;
  orgId: bigint | number;
  streamerId: bigint | number;
  streamlabsSecret: string | null;
  streamlabsRefreshToken: string | null;
  streamlabsOptions: Generated<number>;
  bmacUsername: string | null;
  bmacSecret: string | null;
  bmacOptions: Generated<number>;
  kofiUsername: string | null;
  kofiSecret: string | null;
  kofiOptions: Generated<number>;
  xenditSecret: string | null;
  xenditOptions: Generated<number>;
  stripeSecret: string | null;
  stripeOptions: Generated<number>;
  ffpSecret: string | null;
  ffpOptions: Generated<number>;
  deletedAt: Date | string | null;
  updatedAt: Generated<Date | string>;
}

export interface Session {
  id: Generated<bigint | number>;
  userId: bigint | number;
  userSecret: string;
  token: string;
  method: string;
  userAgent: string;
  os: string | null;
  osVersion: string | null;
  platform: string | null;
  platformType: string | null;
  platformMajor: string | null;
  platformVersion: string | null;
  deviceModel: string | null;
  deviceType: string | null;
  deviceVendor: string | null;
  cpuArchitecture: string | null;
  ipAddress: string;
  ipVersion: number | null;
  isMobile: number | boolean | null;
  isProxy: number | boolean | null;
  isHosting: number | boolean | null;
  isAnonymous: number | boolean | null;
  isAnycast: number | boolean | null;
  isSatellite: number | boolean | null;
  isRelay: number | boolean | null;
  isTor: number | boolean | null;
  isVpn: number | boolean | null;
  isResProxy: number | boolean | null;
  timezone: string | null;
  country: string | null;
  countryCode: string | null;
  countryCodeIso3: string | null;
  continent: string | null;
  continentCode: string | null;
  postal: string | null;
  city: string | null;
  region: string | null;
  regionCode: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  isp: string | null;
  asn: string | null;
  expiresAt: Generated<Date | string>;
  disabledAt: Date | string | null;
  deletedAt: Date | string | null;
  createdAt: Generated<Date | string>;
}

export interface SessionUsage {
  id: Generated<bigint | number>;
  sessionId: bigint | number;
  userId: bigint | number;
  ipAddress: string;
  deletedAt: Date | string | null;
  createdAt: Generated<Date | string>;
}

export interface ReservedUri {
  id: Generated<bigint | number>;
  streamerId: bigint | number;
  uri: string;
  reservedByToken: string;
  disabledAt: Date | string | null;
  deletedAt: Date | string | null;
  createdAt: Generated<Date | string>;
}

export interface WebhookLog {
  id: Generated<bigint | number>;
  provider: string;
  eventType: string;
  rawPayload: string;
  status: string;
  processedAt: Generated<Date | string>;
}

export interface TransactionLog {
  id: Generated<bigint | number>;
  orgId: bigint | number;
  streamerId: bigint | number;
  provider: string;
  providerTxId: string | null;
  type: AlertEventType;
  status: Generated<TransactionStatus>;
  isTest: Generated<number | boolean>;
  isDeleted: Date | string | null;
  amount: bigint | number;
  currency: string;
  senderName: Generated<string>;
  senderEmail: string | null;
  message: string | null;
  rawPayload: string | null;
  createdAt: Generated<Date | string>;
  updatedAt: Generated<Date | string>;
}

export interface WidgetTokenLog {
  id: Generated<bigint | number>;
  widgetId: bigint | number;
  oldToken: string;
  newToken: string;
  ipAddress: string;
  userAgent: string;
  createdAt: Generated<Date | string>;
}

export interface StreamlabsRelayLog {
  id: Generated<bigint | number>;
  orgId: bigint | number;
  streamerId: bigint | number;
  provider: string;
  providerTxId: string | null;
  type: AlertEventType;
  status: Generated<TransactionStatus>;
  amount: bigint | number;
  currency: string;
  senderName: Generated<string>;
  senderEmail: string | null;
  message: string | null;
  rawPayload: string | null;
  errorMessage: string | null;
  createdAt: Generated<Date | string>;
  updatedAt: Generated<Date | string>;
}

export interface DB {
  User: User;
  Organization: Organization;
  OrganizationMember: OrganizationMember;
  OrganizationInvite: OrganizationInvite;
  OrganizationRolePreset: OrganizationRolePreset;
  OrganizationAuditLog: OrganizationAuditLog;
  Streamer: Streamer;
  Widget: Widget;
  AlertboxSetting: AlertboxSetting;
  AlertboxEvent: AlertboxEvent;
  Integration: Integration;
  Session: Session;
  SessionUsage: SessionUsage;
  ReservedUri: ReservedUri;
  WebhookLog: WebhookLog;
  TransactionLog: TransactionLog;
  WidgetTokenLog: WidgetTokenLog;
  StreamlabsRelayLog: StreamlabsRelayLog;
}
