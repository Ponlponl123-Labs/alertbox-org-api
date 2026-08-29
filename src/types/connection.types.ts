export interface BmacWebhookCacheItem {
  id: string;
  userId: string;
  secret: string;
  enabled: boolean;
}

export interface StreamlabsAuthTokens {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
}

export interface KofiWebhookPayload {
  message_id: string;
  timestamp: string;
  type: "Donation" | "Subscription" | "Shop Order";
  from_name: string;
  message: string;
  amount: string;
  currency: string;
  url: string;
  email: string;
  is_subscription_payment: boolean;
  is_first_subscription_payment: boolean;
  kofi_transaction_id: string;
  verification_token: string;
  shop_items?: Array<{ direct_link_code: string; variation_name: string; quantity: number }>;
}
