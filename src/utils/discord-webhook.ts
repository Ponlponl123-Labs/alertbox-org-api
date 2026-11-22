export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

export interface DiscordWebhookPayload {
  username?: string;
  content?: string;
  embeds?: DiscordEmbed[];
}

export function isValidDiscordWebhookUrl(rawUrl: string | undefined | null): rawUrl is string {
  if (!rawUrl || typeof rawUrl !== "string") return false;
  try {
    const url = new URL(rawUrl.trim());
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host !== "discord.com" && host !== "discordapp.com") return false;
    return url.pathname.startsWith("/api/webhooks/");
  } catch {
    return false;
  }
}

export function sanitizeDiscordText(text: string, maxLen = 1024): string {
  const cleaned = String(text ?? "")
    .replace(/@(everyone|here)/gi, "@\u200b$1")
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, Math.max(0, maxLen - 3))}...`;
}

export async function sendDiscordWebhook(
  webhookUrl: string | undefined | null,
  payload: DiscordWebhookPayload,
): Promise<boolean> {
  if (!isValidDiscordWebhookUrl(webhookUrl)) return false;

  try {
    const res = await fetch(webhookUrl.trim(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...payload,
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
