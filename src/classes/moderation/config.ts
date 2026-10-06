import type { ModerationConfig } from "@/types";
import betterConsole, { Card, rgb, tsflag } from "ts-better-console";

export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  enabled: true,
  textEnabled: true,
  imageEnabled: true,
  apiUrl: "",
  cacheTtlSec: 604800,
  timeoutMs: 5000,
};

export class ModerationConfigManager {
  private static warned = false;

  public static printWarningCard(config: ModerationConfig): void {
    const isFullyDisabled = !config.enabled || !config.apiUrl;
    const title = isFullyDisabled
      ? "⚠ Content Moderation Disabled"
      : "⚠ Partial Content Moderation Notice";

    const details = isFullyDisabled
      ? (!config.apiUrl
          ? "No external moderation API endpoint configured (EXTERNAL_MODERATION_API)."
          : "All automated safety checks (Text & Image) are bypassed via configuration.")
      : [
          `• Endpoint        : ${config.apiUrl}`,
          `• Text Moderation : ${config.textEnabled ? "ACTIVE" : "DISABLED"}`,
          `• Image Moderation: ${config.imageEnabled ? "ACTIVE" : "DISABLED"}`,
        ].join("\n");

    new Card(`${title}\n\n${details}`, undefined, {
      border: {
        style: { color: rgb(245, 158, 11) },
        symbols: { style: "round" },
      },
    })
      .render()
      .split("\n")
      .forEach((line) => betterConsole.log(tsflag("warn", true, line)));
  }

  public static printStatusCard(config: ModerationConfig = ModerationConfigManager.get()): void {
    const isOnline = config.enabled && !!config.apiUrl;
    const lines = [
      `· Content Moderation Status`,
      ``,
      `• Global Status    : ${isOnline ? "ENABLED (External API)" : "DISABLED"}`,
      `• Endpoint         : ${config.apiUrl || "NOT CONFIGURED"}`,
      `• Text Checks      : ${config.textEnabled ? "ENABLED" : "DISABLED"}`,
      `• Image Checks     : ${config.imageEnabled ? "ENABLED" : "DISABLED"}`,
      `• Request Timeout  : ${config.timeoutMs}ms`,
      `• Cache TTL        : ${config.cacheTtlSec}s`,
    ];

    new Card(lines.join("\n"), undefined, {
      border: {
        style: { color: isOnline ? rgb(59, 130, 246) : rgb(245, 158, 11) },
        symbols: { style: "round" },
      },
    })
      .render()
      .split("\n")
      .forEach((line) => betterConsole.log(tsflag("info", true, line)));
  }

  public static get(): ModerationConfig {
    const apiUrl = (
      process.env.EXTERNAL_MODERATION_API ||
      process.env.MODERATION_API_URL ||
      DEFAULT_MODERATION_CONFIG.apiUrl
    ).trim().replace(/\/+$/, "");

    const enabled = process.env.MODERATION_ENABLED !== undefined
      ? process.env.MODERATION_ENABLED !== "false"
      : DEFAULT_MODERATION_CONFIG.enabled;

    const textEnabled = process.env.MODERATION_TEXT_ENABLED !== undefined
      ? process.env.MODERATION_TEXT_ENABLED !== "false"
      : DEFAULT_MODERATION_CONFIG.textEnabled;

    const imageEnabled = process.env.MODERATION_IMAGE_ENABLED !== undefined
      ? process.env.MODERATION_IMAGE_ENABLED !== "false"
      : DEFAULT_MODERATION_CONFIG.imageEnabled;

    const timeoutMs = parseInt(
      process.env.MODERATION_TIMEOUT_MS || String(DEFAULT_MODERATION_CONFIG.timeoutMs),
      10,
    );

    const cacheTtlSec = parseInt(
      process.env.MODERATION_CACHE_TTL || String(DEFAULT_MODERATION_CONFIG.cacheTtlSec),
      10,
    );

    const config: ModerationConfig = {
      enabled,
      textEnabled,
      imageEnabled,
      apiUrl,
      timeoutMs,
      cacheTtlSec,
    };

    if (!this.warned) {
      this.warned = true;
      if (!config.enabled || !config.apiUrl || !config.textEnabled || !config.imageEnabled) {
        this.printWarningCard(config);
      }
    }

    return config;
  }
}

export const getModerationConfig = ModerationConfigManager.get;
