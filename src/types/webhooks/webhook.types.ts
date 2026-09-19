import { AlertEventType, TransactionStatus } from "@/generated/prisma/client";

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
  userId: string;
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
