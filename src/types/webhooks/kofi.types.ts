export interface KofiPayload {
  message_id?: string;
  timestamp?: string;
  type?: string;
  is_public?: boolean;
  from_name?: string;
  message?: string;
  amount?: string | number;
  url?: string;
  email?: string;
  currency?: string;
  is_subscription_payment?: boolean;
  is_first_subscription_payment?: boolean;
  kofi_transaction_id?: string;
  verification_token?: string;
  shop_items?: any[];
  tier_name?: string;
  shipping?: any;
}
