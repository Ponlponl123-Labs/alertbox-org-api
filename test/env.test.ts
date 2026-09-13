import { describe, expect, it } from "bun:test";
import { dbConfig, redisConfig, nodeEnv } from "../src/config/env";

describe("Environment & Database Config", () => {
  it("should have a valid nodeEnv defined", () => {
    expect(["development", "production", "test"]).toContain(nodeEnv!);
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

  it("should provide redis config object structure with TLS support", () => {
    expect(redisConfig).toBeDefined();
    expect(typeof redisConfig).toBe("object");
    expect("tls" in redisConfig).toBe(true);
    expect("sentinelTls" in redisConfig).toBe(true);
  });

  it("should support empty DB password when SSL is required or configured", () => {
    const origPass = process.env.DB_PASS;
    const origSsl = process.env.DB_SSL_MODE;
    try {
      process.env.DB_PASS = "";
      process.env.DB_SSL_MODE = "REQUIRED";
      expect(dbConfig.password).toBe("");
      expect(dbConfig.isSslRequired).toBe(true);
      expect(dbConfig.url).toContain("sslmode=require");
      expect(dbConfig.url).not.toContain(":@");
    } finally {
      process.env.DB_PASS = origPass;
      process.env.DB_SSL_MODE = origSsl;
    }
  });

  it("should parse Redis TLS environment settings correctly", () => {
    const origTls = process.env.REDIS_TLS;
    try {
      process.env.REDIS_TLS = "true";
      expect(redisConfig.tls).toBe("true");
    } finally {
      process.env.REDIS_TLS = origTls;
    }
  });
});
