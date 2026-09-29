import { ModerationConfigManager } from "./config";
import { TextModerator } from "./text";
import { ImageModerator } from "./image";
import type { TextModerationResult, ImageModerationResult, ModerationConfig } from "@/types";

export class Moderation {
  public static config = ModerationConfigManager;
  public static text = TextModerator;
  public static image = ImageModerator;

  public static getConfig(): ModerationConfig {
    return ModerationConfigManager.get();
  }

  public static printStatusCard(config?: ModerationConfig): void {
    ModerationConfigManager.printStatusCard(config);
  }

  public static async moderateText(text: string): Promise<TextModerationResult> {
    return TextModerator.moderate(text);
  }

  public static async moderateImage(buffer: Buffer): Promise<ImageModerationResult> {
    return ImageModerator.moderate(buffer);
  }
}
