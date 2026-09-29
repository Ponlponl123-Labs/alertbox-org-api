import crypto from "crypto";
import { redis } from "@/core/redis";
import tomlConfig from "@/config/toml";
import type { TextModerationResult } from "@/types";
import {
  TOXIC_ANCHOR_TEXT,
  NSFW_ANCHOR_TEXT,
  VIOLENCE_ANCHOR_TEXT,
  ADULT_PROMOTION_PATTERNS,
  VIOLENCE_GORE_PATTERNS,
  HATE_SPEECH_SLUR_PATTERNS,
  HARASSMENT_TOXICITY_PATTERNS,
} from "@/consts/moderation";
import { ModerationConfigManager } from "./config";
import { normalizeModerationText, splitModerationChunks } from "@/utils/moderation";
import betterConsole, { tsflag, s } from "ts-better-console";

export class TextModerator {
  private static minilmExtractor: any = null;
  private static toxicBertClassifier: any = null;
  private static toxicAnchorEmbedding: Float32Array | null = null;
  private static nsfwAnchorEmbedding: Float32Array | null = null;
  private static violenceAnchorEmbedding: Float32Array | null = null;

  private static isRedisReady(): boolean {
    return !!tomlConfig.redis?.enabled && redis?.redis?.status === "ready";
  }

  private static async getMinilmExtractor() {
    if (!this.minilmExtractor) {
      const config = ModerationConfigManager.get();
      betterConsole.log(
        tsflag("info", true, s("· Content Moderation: Text pipeline initialization triggered", { color: "cyan" })),
      );
      betterConsole.log(
        tsflag("info", true, "· Loading model weights: Xenova/paraphrase-multilingual-MiniLM-L12-v2 (quantized int8)..."),
      );

      const startTime = performance.now();
      const { pipeline } = await import("@huggingface/transformers");
      this.minilmExtractor = await pipeline(
        "feature-extraction",
        "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
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
            `✓ Text Moderation ready in ${elapsed}ms! Model: Xenova/paraphrase-multilingual-MiniLM-L12-v2 [Multilingual Thai+EN, Dim: 384, Threads: ${config.cpuThreads}]`,
            { color: "green" },
          ),
        ),
      );
    }
    return this.minilmExtractor;
  }

  private static async getToxicBertClassifier() {
    if (!this.toxicBertClassifier) {
      const config = ModerationConfigManager.get();
      betterConsole.log(
        tsflag("info", true, s("· Content Moderation: Text pipeline initialization triggered", { color: "cyan" })),
      );
      betterConsole.log(
        tsflag("info", true, "· Loading model weights: Xenova/toxic-bert (quantized int8)..."),
      );

      const startTime = performance.now();
      const { pipeline } = await import("@huggingface/transformers");
      this.toxicBertClassifier = await pipeline(
        "text-classification",
        "Xenova/toxic-bert",
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
            `✓ Text Moderation ready in ${elapsed}ms! Model: Xenova/toxic-bert [Threads: ${config.cpuThreads}]`,
            { color: "green" },
          ),
        ),
      );
    }
    return this.toxicBertClassifier;
  }

  private static async getToxicAnchor(extractor: any): Promise<Float32Array> {
    if (!this.toxicAnchorEmbedding) {
      const output = await extractor(TOXIC_ANCHOR_TEXT, {
        pooling: "mean",
        normalize: true,
      });
      this.toxicAnchorEmbedding = new Float32Array(output.data);
    }
    return this.toxicAnchorEmbedding;
  }

  private static async getNsfwAnchor(extractor: any): Promise<Float32Array> {
    if (!this.nsfwAnchorEmbedding) {
      const output = await extractor(NSFW_ANCHOR_TEXT, {
        pooling: "mean",
        normalize: true,
      });
      this.nsfwAnchorEmbedding = new Float32Array(output.data);
    }
    return this.nsfwAnchorEmbedding;
  }

  private static async getViolenceAnchor(extractor: any): Promise<Float32Array> {
    if (!this.violenceAnchorEmbedding) {
      const output = await extractor(VIOLENCE_ANCHOR_TEXT, {
        pooling: "mean",
        normalize: true,
      });
      this.violenceAnchorEmbedding = new Float32Array(output.data);
    }
    return this.violenceAnchorEmbedding;
  }

  public static async moderate(text: string): Promise<TextModerationResult> {
    const config = ModerationConfigManager.get();
    if (!config.enabled || !config.textEnabled || config.textEngine === "none") {
      return { flagged: false, score: 0, engine: "none" };
    }

    // DoS guard: limit input length to 4000 characters
    const trimmed = text.slice(0, 4000).trim();
    if (!trimmed) {
      return { flagged: false, score: 0, engine: config.textEngine };
    }

    const hash = crypto.createHash("sha256").update(trimmed).digest("hex");
    const cacheKey = `moderation:text:${hash}`;

    if (this.isRedisReady()) {
      try {
        const cached = await redis.redis.get(cacheKey);
        if (cached) {
          return JSON.parse(cached) as TextModerationResult;
        }
      } catch {
        // Ignore Redis read errors
      }
    }

    // Step 1: Normalize & de-obfuscate text via shared utils
    const normalized = normalizeModerationText(trimmed);

    // Step 2: Tier 0 Deterministic Pattern Matching (0ms short-circuit)
    if (ADULT_PROMOTION_PATTERNS.some((p) => p.test(normalized))) {
      const res: TextModerationResult = {
        flagged: true,
        score: 1.0,
        engine: "lexicon",
        category: "nsfw_content",
        reason: "Sexually explicit or adult content detected",
      };
      await this.cacheResult(cacheKey, res, config.cacheTtlSec);
      return res;
    }

    if (VIOLENCE_GORE_PATTERNS.some((p) => p.test(normalized))) {
      const res: TextModerationResult = {
        flagged: true,
        score: 1.0,
        engine: "lexicon",
        category: "graphic_violence",
        reason: "Graphic violence, physical threats, or gore detected",
      };
      await this.cacheResult(cacheKey, res, config.cacheTtlSec);
      return res;
    }

    if (HATE_SPEECH_SLUR_PATTERNS.some((p) => p.test(normalized))) {
      const res: TextModerationResult = {
        flagged: true,
        score: 1.0,
        engine: "lexicon",
        category: "hate_speech",
        reason: "Hate speech, identity slurs, or harassment detected",
      };
      await this.cacheResult(cacheKey, res, config.cacheTtlSec);
      return res;
    }

    if (HARASSMENT_TOXICITY_PATTERNS.some((p) => p.test(normalized))) {
      const res: TextModerationResult = {
        flagged: true,
        score: 1.0,
        engine: "lexicon",
        category: "harassment",
        reason: "Harassment or toxic conduct detected",
      };
      await this.cacheResult(cacheKey, res, config.cacheTtlSec);
      return res;
    }

    // Step 3: Tier 1 Semantic Machine Learning Evaluation
    try {
      let flagged = false;
      let maxScore = 0;
      let matchedCategory: string | undefined;
      const engine = config.textEngine;

      if (engine === "minilm") {
        const { cos_sim } = await import("@huggingface/transformers");
        const extractor = await this.getMinilmExtractor();
        const toxicAnchor = await this.getToxicAnchor(extractor);
        const nsfwAnchor = await this.getNsfwAnchor(extractor);
        const violenceAnchor = await this.getViolenceAnchor(extractor);

        // Anti-dilution chunking: evaluate both full text and individual clauses
        const chunks = splitModerationChunks(normalized);

        for (const chunk of chunks) {
          const emb = await extractor(chunk, {
            pooling: "mean",
            normalize: true,
          });

          const toxicSim = Math.max(0, (cos_sim as any)(emb.data, toxicAnchor));
          const nsfwSim = Math.max(0, (cos_sim as any)(emb.data, nsfwAnchor));
          const violenceSim = Math.max(0, (cos_sim as any)(emb.data, violenceAnchor));

          const chunkMax = Math.max(toxicSim, nsfwSim, violenceSim);
          if (chunkMax > maxScore) {
            maxScore = chunkMax;
            if (chunkMax === nsfwSim) matchedCategory = "nsfw_content";
            else if (chunkMax === violenceSim) matchedCategory = "graphic_violence";
            else matchedCategory = "inappropriate_text";
          }
        }

        flagged = maxScore >= config.textThreshold;
      } else if (engine === "toxic-bert") {
        const classifier = await this.getToxicBertClassifier();
        const results = await classifier(normalized);
        const toxicEntry = Array.isArray(results)
          ? results.find((r: any) => r.label === "toxic") || results[0]
          : results;

        maxScore = toxicEntry?.score || 0;
        flagged = maxScore >= config.textThreshold;
        matchedCategory = flagged ? "inappropriate_text" : undefined;
      }

      const result: TextModerationResult = {
        flagged,
        score: maxScore,
        engine,
        category: flagged ? matchedCategory : undefined,
        reason: flagged ? "Text failed content safety thresholds" : undefined,
      };

      await this.cacheResult(cacheKey, result, config.cacheTtlSec);
      return result;
    } catch (err) {
      betterConsole.error(
        tsflag("warn", true, s(`Content moderation text check failed: ${err}`, { color: "yellow" })),
      );
      return { flagged: false, score: 0, engine: config.textEngine };
    }
  }

  private static async cacheResult(key: string, result: TextModerationResult, ttlSec: number): Promise<void> {
    if (this.isRedisReady()) {
      try {
        await redis.redis.setex(key, ttlSec, JSON.stringify(result));
      } catch {
        // Ignore Redis write errors
      }
    }
  }
}

export const moderateText = TextModerator.moderate.bind(TextModerator);
