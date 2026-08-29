import { describe, expect, it } from "bun:test";
import { dbConfig, redisConfig, nodeEnv } from "../src/config/env";

describe("Environment & Database Config", () => {
  it("should have a valid nodeEnv defined", () => {
    expect(["development", "production", "test"]).toContain(nodeEnv);
  });

  it("should provide default database configuration if env vars are unset", () => {
    expect(dbConfig.host).toBeDefined();
    expect(typeof dbConfig.port).toBe("number");
    expect(dbConfig.user).toBeDefined();
    expect(dbConfig.database).toBeDefined();
  });

  it("should format database URL correctly with credentials and host", () => {
    const url = dbConfig.url;
    expect(typeof url).toBe("string");
    expect(url.length).toBeGreaterThan(0);
    expect(url.startsWith("mysql://") || url.startsWith("mariadb://") || url.startsWith("postgresql://") || url.startsWith("file:")).toBe(true);
  });

  it("should provide redis config object structure", () => {
    expect(redisConfig).toBeDefined();
    expect(typeof redisConfig).toBe("object");
  });
});
