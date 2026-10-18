import { AlertEventType, TransactionStatus } from "@/db/enums";

export interface WebhookResponse {
  status: number;
  body: string;
}

export interface StreamlabsRelayConfig {
  secret: string | null;
  refreshToken: string | null;
  options: number;
  optionFlag: number;
}

export interface DonationEventPayload {
  orgId: string | bigint;
  streamerId: string | bigint;
  userId?: string | bigint;
  provider: "kofi" | "buymeacoffee" | string;
  providerTxId: string;
  type: AlertEventType;
  status?: TransactionStatus;
  amount: number;
  currency: string;
  senderName: string;
  senderEmail?: string | null;
  message?: string | null;
  isTest: boolean;
  rawPayload: string;
  streamlabs?: StreamlabsRelayConfig | null;
}

export interface BmacWebhookParams {
  body: any;
  headers: Record<string, string | undefined>;
  request: Request;
}
