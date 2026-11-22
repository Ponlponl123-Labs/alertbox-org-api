import { describe, expect, it } from "bun:test";
import { isValidDiscordWebhookUrl, sanitizeDiscordText } from "./discord-webhook";

describe("Discord Webhook Utilities", () => {
  it("accepts only official HTTPS Discord webhook URLs", () => {
    expect(isValidDiscordWebhookUrl("https://discord.com/api/webhooks/123/abc")).toBe(true);
    expect(isValidDiscordWebhookUrl("https://discordapp.com/api/webhooks/123/abc")).toBe(true);
    expect(isValidDiscordWebhookUrl("http://discord.com/api/webhooks/123/abc")).toBe(false);
    expect(isValidDiscordWebhookUrl("https://evil.example.com/api/webhooks/123/abc")).toBe(false);
    expect(isValidDiscordWebhookUrl("https://discord.com/channels/123")).toBe(false);
    expect(isValidDiscordWebhookUrl("")).toBe(false);
  });

  it("neutralizes @everyone and @here mentions and truncates long text", () => {
    const sanitized = sanitizeDiscordText("hello @everyone and @here");
    expect(sanitized).not.toContain("@everyone");
    expect(sanitized).not.toContain("@here");
    expect(sanitizeDiscordText("a".repeat(20), 10)).toBe("aaaaaaa...");
  });
});
