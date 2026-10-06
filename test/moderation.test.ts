import { describe, expect, it } from "bun:test";
import { Moderation, moderateText, moderateImage } from "../src/classes/moderation";

const moderationApi = process.env.EXTERNAL_MODERATION_API || process.env.MODERATION_API_URL;
const describeIfApi = moderationApi ? describe : describe.skip;

describeIfApi("Content Moderation Service (External API)", () => {
  describe("Configuration & Environment", () => {
    it("should load configuration settings", () => {
      const config = Moderation.getConfig();
      expect(config.enabled).toBeBoolean();
      expect(config.textEnabled).toBeBoolean();
      expect(config.imageEnabled).toBeBoolean();
      expect(config.apiUrl).toBeString();
    });

    it("should render status and warning cards cleanly", () => {
      expect(() => Moderation.printStatusCard()).not.toThrow();
      expect(() =>
        Moderation.config.printWarningCard({
          ...Moderation.getConfig(),
          enabled: false,
        }),
      ).not.toThrow();
    });
  });

  describe("Text Moderation", () => {
    it("should allow clean English and Thai text", async () => {
      const resEn = await moderateText("Welcome to my programming stream! Enjoy your stay.");
      expect(resEn.flagged).toBe(false);

      const resTh = await moderateText("สวัสดีครับ ยินดีต้อนรับทุกคนสู่ช่องสตรีมเกม");
      expect(resTh.flagged).toBe(false);
    }, 15000);

    it("should flag explicitly toxic/offensive Thai and English text", async () => {
      const resEn = await moderateText("fuck you idiot bitch");
      expect(resEn.flagged).toBe(true);

      const resTh = await moderateText("ไอ้เหี้ย มึงไปตายซะ ควย");
      expect(resTh.flagged).toBe(true);
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
  });
});
