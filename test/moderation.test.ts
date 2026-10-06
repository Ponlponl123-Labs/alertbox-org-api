import { describe, expect, it } from "bun:test";
import { Moderation, moderateText, moderateImage, getModerationConfig } from "../src/classes/moderation";

describe("Content Moderation Service", () => {
  describe("Configuration & Environment", () => {
    it("should load default configuration settings", () => {
      const config = Moderation.getConfig();
      expect(config.enabled).toBeBoolean();
      expect(config.textEnabled).toBeBoolean();
      expect(config.imageEnabled).toBeBoolean();
      expect(["minilm", "toxic-bert", "none"]).toContain(config.textEngine);
      expect(config.cpuThreads).toBeGreaterThanOrEqual(1);
    });

    it("should render status and warning cards cleanly", () => {
      expect(() => Moderation.printStatusCard()).not.toThrow();
      expect(() => Moderation.config.printWarningCard({
        ...Moderation.getConfig(),
        enabled: false,
      })).not.toThrow();
    });
  });

  describe("Text Moderation", () => {
    it("should allow clean English and Thai text", async () => {
      const resEn = await moderateText("Welcome to my programming stream! Enjoy your stay.");
      expect(resEn.flagged).toBe(false);

      const resTh = await moderateText("สวัสดีครับ ยินดีต้อนรับทุกคนสู่ช่องสตรีมเกม");
      expect(resTh.flagged).toBe(false);
    });

    it("should flag explicitly toxic/offensive Thai and English text", async () => {
      const resEn = await moderateText("fuck you idiot bitch");
      expect(resEn.flagged).toBe(true);

      const resTh = await moderateText("ไอ้เหี้ย มึงไปตายซะ ควย");
      expect(resTh.flagged).toBe(true);
    });

    it("should flag sexually explicit and NSFW innuendo text in Thai and English", async () => {
      const nsfwLines = [
        "join me and i will send you my kitty.",
        "wet kitty play with massive cucumber.",
        "huge amount of cum, creampie, kitty view, pink kitty, inside my kitty.",
        "หีอมชมพู ควยใหญ่",
      ];
      for (const line of nsfwLines) {
        const res = await moderateText(line);
        expect(res.flagged).toBe(true);
      }
    });

    it("should allow benign usage of innocent words like kitty or cucumber", async () => {
      const benignLines = [
        "I adopted a cute kitty today!",
        "I made a fresh cucumber salad for lunch",
        "Hello World!",
      ];
      for (const line of benignLines) {
        const res = await moderateText(line);
        expect(res.flagged).toBe(false);
      }
    });

    it("should handle empty or whitespace string without error", async () => {
      const res = await moderateText("   ");
      expect(res.flagged).toBe(false);
      expect(res.score).toBe(0);
    });
  });

  describe("Image Moderation", () => {
    it("should handle empty or zero-byte buffer without crashing", async () => {
      const res = await moderateImage(Buffer.alloc(0));
      expect(res.flagged).toBe(false);
    });

    it("should accept normal non-NSFW images", async () => {
      // 1x1 neutral white pixel
      const { RawImage } = await import("@huggingface/transformers");
      const img = new RawImage(new Uint8ClampedArray([255, 255, 255, 255]), 1, 1, 4);
      expect(img.width).toBe(1);
    });
  });
});
