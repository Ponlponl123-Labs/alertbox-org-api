import { describe, expect, it } from "bun:test";
import { isValidUri } from "../src/utils/regex";
import {
  hexColorToNumber,
  numberToHexColor,
  getAccentForeground,
} from "../src/utils/color";

describe("Profile Validation & Color Utilities", () => {
  describe("URI Slug Validation", () => {
    it("should allow valid lowercase alphanumeric usernames with underscores", () => {
      expect(isValidUri("streamer_123")).toBe(true);
      expect(isValidUri("cool_dev")).toBe(true);
      expect(isValidUri("streamer")).toBe(true);
    });

    it("should reject invalid characters (special chars, spaces, uppercase)", () => {
      expect(isValidUri("Streamer")).toBe(false);
      expect(isValidUri("streamer-123")).toBe(false);
      expect(isValidUri("streamer 123")).toBe(false);
      expect(isValidUri("streamer@live")).toBe(false);
    });

    it("should reject reserved system URIs", () => {
      expect(isValidUri("admin")).toBe(false);
      expect(isValidUri("api")).toBe(false);
      expect(isValidUri("auth")).toBe(false);
      expect(isValidUri("system")).toBe(false);
      expect(isValidUri("settings")).toBe(false);
    });
  });

  describe("Color Processing", () => {
    it("should convert hex colors to 24-bit integer values", () => {
      expect(hexColorToNumber("#ffffff")).toBe(16777215);
      expect(hexColorToNumber("#000000")).toBe(0);
      expect(hexColorToNumber("#ff0000")).toBe(16711680);
      expect(hexColorToNumber("00ff00")).toBe(65280);
    });

    it("should expand 3-digit shorthand hex colors", () => {
      expect(hexColorToNumber("#fff")).toBe(16777215);
      expect(hexColorToNumber("#f00")).toBe(16711680);
      expect(hexColorToNumber("000")).toBe(0);
    });

    it("should convert integer colors back to 6-digit hex format", () => {
      expect(numberToHexColor(16777215)).toBe("#ffffff");
      expect(numberToHexColor(0)).toBe("#000000");
      expect(numberToHexColor(16711680)).toBe("#ff0000");
    });

    it("should determine proper readable contrast foreground according to YIQ", () => {
      expect(getAccentForeground("#ffffff")).toBe("#000000");
      expect(getAccentForeground("#ffff00")).toBe("#000000");
      expect(getAccentForeground("#000000")).toBe("#ffffff");
      expect(getAccentForeground("#1a1a1a")).toBe("#ffffff");
      expect(getAccentForeground("#1e1b4b")).toBe("#ffffff");
    });
  });
});
