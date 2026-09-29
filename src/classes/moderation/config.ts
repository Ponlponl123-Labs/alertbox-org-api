import type { ModerationConfig } from "@/types";
import { DEFAULT_MODERATION_CONFIG } from "@/consts/moderation";
import betterConsole, { Card, rgb, tsflag } from "ts-better-console";

export class ModerationConfigManager {
  private static warned = false;

  public static printWarningCard(config: ModerationConfig): void {
    const isFullyDisabled = !config.enabled;
    const title = isFullyDisabled
      ? "⚠ Content Moderation Disabled"
      : "⚠ Partial Content Moderation Notice";

    const details = isFullyDisabled
      ? "All automated safety checks (Text & Image) are bypassed via configuration."
      : [
          `• Text Moderation  : ${config.textEnabled && config.textEngine !== "none" ? `ACTIVE (${config.textEngine})` : "DISABLED"}`,
          `• Image Moderation : ${config.imageEnabled ? "ACTIVE (nsfw_image_detection)" : "DISABLED"}`,
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
    const lines = [
      `· Content Moderation Status`,
      ``,
      `• Global Status    : ${config.enabled ? "ENABLED" : "DISABLED"}`,
      `• Text Engine      : ${config.textEnabled ? config.textEngine : "DISABLED"} (threshold: ${config.textThreshold})`,
      `• Image Engine     : ${config.imageEnabled ? "nsfw_image_detection" : "DISABLED"} (threshold: ${config.imageNsfwThreshold})`,
      `• CPU Threads      : ${config.cpuThreads}`,
      `• Cache TTL        : ${config.cacheTtlSec}s`,
    ];

    new Card(lines.join("\n"), undefined, {
      border: {
        style: { color: config.enabled ? rgb(59, 130, 246) : rgb(245, 158, 11) },
        symbols: { style: "round" },
      },
    })
      .render()
      .split("\n")
      .forEach((line) => betterConsole.log(tsflag("info", true, line)));
  }

  public static get(): ModerationConfig {
    const enabled = process.env.MODERATION_ENABLED !== undefined
      ? process.env.MODERATION_ENABLED !== "false"
      : DEFAULT_MODERATION_CONFIG.enabled;

    const textEnabled = process.env.MODERATION_TEXT_ENABLED !== undefined
      ? process.env.MODERATION_TEXT_ENABLED !== "false"
      : DEFAULT_MODERATION_CONFIG.textEnabled;

    const imageEnabled = process.env.MODERATION_IMAGE_ENABLED !== undefined
      ? process.env.MODERATION_IMAGE_ENABLED !== "false"
      : DEFAULT_MODERATION_CONFIG.imageEnabled;

    const rawEngine = (process.env.MODERATION_TEXT_ENGINE || DEFAULT_MODERATION_CONFIG.textEngine).toLowerCase();
    const textEngine: ModerationConfig["textEngine"] =
      rawEngine === "toxic-bert" || rawEngine === "none"
        ? (rawEngine as any)
        : "minilm";

    const cpuThreads = Math.max(
      1,
      parseInt(process.env.MODERATION_CPU_THREADS || String(DEFAULT_MODERATION_CONFIG.cpuThreads), 10),
    );

    const textThreshold = parseFloat(
      process.env.MODERATION_TEXT_THRESHOLD || String(DEFAULT_MODERATION_CONFIG.textThreshold),
    );

    const imageNsfwThreshold = parseFloat(
      process.env.MODERATION_IMAGE_NSFW_THRESHOLD || String(DEFAULT_MODERATION_CONFIG.imageNsfwThreshold),
    );

    const cacheTtlSec = parseInt(
      process.env.MODERATION_CACHE_TTL || String(DEFAULT_MODERATION_CONFIG.cacheTtlSec),
      10,
    );

    const config: ModerationConfig = {
      enabled,
      textEnabled,
      imageEnabled,
      textEngine,
      cpuThreads,
      textThreshold,
      imageNsfwThreshold,
      cacheTtlSec,
    };

    if (!this.warned) {
      this.warned = true;
      if (!config.enabled || !config.textEnabled || !config.imageEnabled || config.textEngine === "none") {
        this.printWarningCard(config);
      }
    }

    return config;
  }
}

export const getModerationConfig = ModerationConfigManager.get;
