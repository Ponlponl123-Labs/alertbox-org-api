import crypto from "crypto";
import { redis } from "@/core/redis";
import tomlConfig from "@/config/toml";
import type { TextModerationResult } from "@/types";
import { ModerationConfigManager } from "./config";
import betterConsole, { tsflag } from "ts-better-console";

export class TextModerator {
  private static isRedisReady(): boolean {
    return !!tomlConfig.redis?.enabled && redis?.redis?.status === "ready";
  }

  public static async moderate(text: string): Promise<TextModerationResult> {
    const config = ModerationConfigManager.get();

    if (!config.enabled || !config.textEnabled || !config.apiUrl) {
      return {
        flagged: false,
        score: 0,
        engine: "none",
      };
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return {
        flagged: false,
        score: 0,
        engine: "external-moderation-api",
      };
    }

    const hash = crypto.createHash("sha256").update(trimmed).digest("hex");
    const cacheKey = `mod:text:${hash}`;

    if (this.isRedisReady()) {
      try {
        const cached = await redis.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached);
        }
      } catch {
        // Cache read failure is non-fatal
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);

      const endpoint = `${config.apiUrl}/v1/moderate/text`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ text: trimmed }),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!response.ok) {
        betterConsole.log(
          tsflag("warn", true, `! External moderation API returned HTTP ${response.status} on text check`),
        );
        return {
          flagged: false,
          score: 0,
          engine: "external-fallback",
        };
      }

      const data: any = await response.json();
      const result: TextModerationResult = {
        flagged: Boolean(data.flagged),
        score: typeof data.score === "number" ? data.score : (data.flagged ? 1 : 0),
        engine: "external-moderation-api",
        category: data.category,
        reason: data.reason || data.category,
      };

      if (this.isRedisReady()) {
        try {
          await redis.redis.setex(cacheKey, config.cacheTtlSec, JSON.stringify(result));
        } catch {
          // Cache write failure is non-fatal
        }
      }

      return result;
    } catch (err: any) {
      betterConsole.log(
        tsflag("warn", true, `! External moderation service unreachable: ${err?.message || err}`),
      );
      return {
        flagged: false,
        score: 0,
        engine: "external-fallback",
      };
    }
  }
}

export const moderateText = TextModerator.moderate.bind(TextModerator);
