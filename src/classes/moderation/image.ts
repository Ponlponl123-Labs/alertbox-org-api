import crypto from "crypto";
import { redis } from "@/core/redis";
import tomlConfig from "@/config/toml";
import type { ImageModerationResult } from "@/types";
import { ModerationConfigManager } from "./config";
import betterConsole, { tsflag, s } from "ts-better-console";

export class ImageModerator {
  private static imageNsfwClassifier: any = null;

  private static isRedisReady(): boolean {
    return !!tomlConfig.redis?.enabled && redis?.redis?.status === "ready";
  }

  private static async getImageNsfwClassifier() {
    if (!this.imageNsfwClassifier) {
      const config = ModerationConfigManager.get();
      betterConsole.log(
        tsflag("info", true, s("· Content Moderation: Image pipeline initialization triggered", { color: "cyan" })),
      );
      betterConsole.log(
        tsflag("info", true, "· Loading model weights: onnx-community/nsfw_image_detection-ONNX (MobileNetV2 int8)..."),
      );

      const startTime = performance.now();
      const { pipeline } = await import("@huggingface/transformers");
      this.imageNsfwClassifier = await pipeline(
        "image-classification",
        "onnx-community/nsfw_image_detection-ONNX",
        {
          session_options: {
            intraOpNumThreads: config.cpuThreads,
            interOpNumThreads: config.cpuThreads,
          },
        },
      );
      const elapsed = (performance.now() - startTime).toFixed(1);

      betterConsole.log(
        tsflag(
          "info",
          true,
          s(
            `✓ Image Moderation ready in ${elapsed}ms! Model: nsfw_image_detection-ONNX [Architecture: MobileNetV2, Threshold: ${config.imageNsfwThreshold}]`,
            { color: "green" },
          ),
        ),
      );
    }
    return this.imageNsfwClassifier;
  }

  public static async moderate(buffer: Buffer): Promise<ImageModerationResult> {
    const config = ModerationConfigManager.get();
    if (!config.enabled || !config.imageEnabled) {
      return { flagged: false, score: 0, engine: "none" };
    }

    if (!buffer || buffer.length === 0) {
      return { flagged: false, score: 0, engine: "none" };
    }

    if (buffer.length > 20 * 1024 * 1024) {
      return {
        flagged: true,
        score: 1.0,
        engine: "guard",
        category: "oversized_payload",
        reason: "Image exceeds 20MB maximum moderation payload size",
      };
    }

    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    const cacheKey = `moderation:img:${hash}`;

    if (this.isRedisReady()) {
      try {
        const cached = await redis.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as ImageModerationResult;
        }
      } catch {
        // Ignore Redis read errors
      }
    }

    try {
      const { RawImage } = await import("@huggingface/transformers");
      const classifier = await this.getImageNsfwClassifier();

      const img = await RawImage.read(new Blob([new Uint8Array(buffer)]));
      const results = await classifier(img);

      const nsfwEntry = Array.isArray(results)
        ? results.find((r: any) => r.label?.toLowerCase() === "nsfw")
        : results;

      const nsfwScore = nsfwEntry?.score || 0;
      const flagged = nsfwScore >= config.imageNsfwThreshold;

      const result: ImageModerationResult = {
        flagged,
        score: nsfwScore,
        engine: "nsfw_image_detection",
        category: flagged ? "nsfw_image" : undefined,
        reason: flagged ? "Image contains adult or sexually explicit content" : undefined,
      };

      if (this.isRedisReady()) {
        try {
          await redis.redis.setex(cacheKey, config.cacheTtlSec, JSON.stringify(result));
        } catch {
          // Ignore Redis write errors
        }
      }

      return result;
    } catch (err) {
      betterConsole.error(
        tsflag("warn", true, s(`Content moderation image check failed: ${err}`, { color: "yellow" })),
      );
      return { flagged: false, score: 0, engine: "nsfw_image_detection" };
    }
  }
}

export const moderateImage = ImageModerator.moderate.bind(ImageModerator);
