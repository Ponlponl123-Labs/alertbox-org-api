import { describe, expect, test } from "bun:test";
import { formatStreamlabsName } from "./streamlabs";

describe("formatStreamlabsName", () => {
  test("returns Anonymous for null or undefined or empty input", () => {
    expect(formatStreamlabsName(null)).toBe("Anonymous");
    expect(formatStreamlabsName(undefined)).toBe("Anonymous");
    expect(formatStreamlabsName("")).toBe("Anonymous");
    expect(formatStreamlabsName("   ")).toBe("Anonymous");
  });

  test("handles valid ASCII names within character limits", () => {
    expect(formatStreamlabsName("John Doe")).toBe("John Doe");
    expect(formatStreamlabsName("User_123")).toBe("User_123");
  });

  test("supports UTF-8 Unicode letters in various languages", () => {
    expect(formatStreamlabsName("สมชาย 123")).toBe("สมชาย 123");
    expect(formatStreamlabsName("José_99")).toBe("José_99");
    expect(formatStreamlabsName("田中太郎")).toBe("田中太郎");
  });

  test("strips invalid symbols and emojis", () => {
    expect(formatStreamlabsName("John @ Doe !")).toBe("John Doe");
    expect(formatStreamlabsName("田中太郎 ❤️")).toBe("田中太郎");
    expect(formatStreamlabsName("✨Sparkles✨")).toBe("Sparkles");
  });

  test("falls back to Anonymous when all characters are invalid", () => {
    expect(formatStreamlabsName("@!")).toBe("Anonymous");
    expect(formatStreamlabsName("!@#$%^&*()")).toBe("Anonymous");
    expect(formatStreamlabsName("🎉🎉🎉")).toBe("Anonymous");
    expect(formatStreamlabsName("💩🔥")).toBe("Anonymous");
  });

  test("falls back to Anonymous if sanitized result is under 2 characters", () => {
    expect(formatStreamlabsName("A")).toBe("Anonymous");
    expect(formatStreamlabsName("A                      ")).toBe("Anonymous");
    expect(formatStreamlabsName("A !@#$%^&*()")).toBe("Anonymous");
  });

  test("truncates names longer than 25 code points", () => {
    const longName = "ThisIsAVeryLongNameThatExceedsTwentyFiveCharacters";
    const result = formatStreamlabsName(longName);
    expect(Array.from(result).length).toBeLessThanOrEqual(25);
    expect(result).toBe("ThisIsAVeryLongNameThatEx");
  });

  test("truncates long Unicode UTF-8 names safely", () => {
    const longThaiName = "สมชายใจดีมีสุขความสุขมากที่สุดในโลก";
    const result = formatStreamlabsName(longThaiName);
    expect(Array.from(result).length).toBeLessThanOrEqual(25);
  });
});

describe("refreshStreamlabsToken", () => {
  test("returns null if refresh fails", async () => {
    const { refreshStreamlabsToken } = await import("./streamlabs");
    const res = await refreshStreamlabsToken("fake-user-id", "invalid-token");
    expect(res).toBeNull();
  });
});
