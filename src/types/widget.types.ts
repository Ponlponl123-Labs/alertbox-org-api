export interface WidgetTokenData {
  userId: string;
  username: string;
}

export interface WidgetAlertPayload {
  id: string;
  type: "donation" | "subscription" | "cheer" | "custom";
  sender: string;
  amount?: number;
  currency?: string;
  message?: string;
  timestamp: number;
}

export interface WidgetWebSocketMessage {
  event: "alert" | "ping" | "pong" | "connected" | "error";
  data?: WidgetAlertPayload | Record<string, unknown>;
  message?: string;
}
