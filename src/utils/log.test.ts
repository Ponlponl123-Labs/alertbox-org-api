import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import { Logger } from "./log";

describe("Logger Multimode & Environment Defaults", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalLogLevel = process.env.LOG_LEVEL;
  const originalLogMode = process.env.LOG_MODE;

  beforeEach(() => {
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_MODE;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    if (originalLogLevel !== undefined) {
      process.env.LOG_LEVEL = originalLogLevel;
    } else {
      delete process.env.LOG_LEVEL;
    }
    if (originalLogMode !== undefined) {
      process.env.LOG_MODE = originalLogMode;
    } else {
      delete process.env.LOG_MODE;
    }
  });

  it("should default development to verbose (all categories enabled)", () => {
    process.env.NODE_ENV = "development";
    const logger = new Logger();

    expect(logger.isVerbose()).toBe(true);
    expect(logger.isTraffic()).toBe(true);
    expect(logger.isTrafficPending()).toBe(true);
    expect(logger.isDebug()).toBe(true);
    expect(logger.isProcess()).toBe(true);
    expect(logger.isSilent()).toBe(false);
  });

  it("should default test to traffic + process", () => {
    process.env.NODE_ENV = "test";
    const logger = new Logger();

    expect(logger.isVerbose()).toBe(false);
    expect(logger.isTraffic()).toBe(true);
    expect(logger.isTrafficPending()).toBe(false);
    expect(logger.isProcess()).toBe(true);
    expect(logger.isDebug()).toBe(false);
    expect(logger.isSilent()).toBe(false);
  });

  it("should default production to no logging (silent)", () => {
    process.env.NODE_ENV = "production";
    const logger = new Logger();

    expect(logger.isVerbose()).toBe(false);
    expect(logger.isTraffic()).toBe(false);
    expect(logger.isProcess()).toBe(false);
    expect(logger.isDebug()).toBe(false);
    expect(logger.isSilent()).toBe(true);
  });

  it("should support production with traffic when LOG_LEVEL=traffic", () => {
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "traffic";
    const logger = new Logger();

    expect(logger.isTraffic()).toBe(true);
    expect(logger.isVerbose()).toBe(false);
    expect(logger.isProcess()).toBe(false);
    expect(logger.isDebug()).toBe(false);
    expect(logger.isSilent()).toBe(false);
  });

  it("should support explicit 'no logging' / 'silent' / 'none' override", () => {
    process.env.NODE_ENV = "development";
    process.env.LOG_LEVEL = "no logging";
    const logger = new Logger();

    expect(logger.isSilent()).toBe(true);
    expect(logger.isVerbose()).toBe(false);
    expect(logger.isTraffic()).toBe(false);
    expect(logger.isProcess()).toBe(false);
    expect(logger.isDebug()).toBe(false);
  });

  it("should support comma-separated custom flags (e.g. traffic,process)", () => {
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "traffic,process";
    const logger = new Logger();

    expect(logger.isTraffic()).toBe(true);
    expect(logger.isProcess()).toBe(true);
    expect(logger.isVerbose()).toBe(false);
    expect(logger.isDebug()).toBe(false);
  });

  it("should support traffic-pending flag explicitly", () => {
    process.env.NODE_ENV = "production";
    process.env.LOG_LEVEL = "traffic-pending";
    const logger = new Logger();

    expect(logger.isTrafficPending()).toBe(true);
    expect(logger.isTraffic()).toBe(false);
    expect(logger.isVerbose()).toBe(false);
  });
});
