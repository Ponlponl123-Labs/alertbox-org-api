import betterConsole, { s, tsflag } from "ts-better-console";

export type LogCategory =
  | "verbose"
  | "traffic"
  | "traffic-pending"
  | "debug"
  | "process";

export class Logger {
  private activeCategories: Set<LogCategory> = new Set();
  private explicitSilent: boolean = false;

  constructor() {
    this.refresh();
  }

  /**
   * Re-evaluates active logging categories based on LOG_LEVEL / LOG_MODE and NODE_ENV.
   */
  public refresh(): void {
    const rawEnv = (process.env.LOG_LEVEL || process.env.LOG_MODE || "").toLowerCase().trim();
    const nodeEnv = (process.env.NODE_ENV || "").toLowerCase().trim();

    this.activeCategories.clear();
    this.explicitSilent = false;

    // Explicit "no logging"
    if (
      rawEnv === "none" ||
      rawEnv === "silent" ||
      rawEnv === "no logging" ||
      rawEnv === "off" ||
      rawEnv === "false"
    ) {
      this.explicitSilent = true;
      return;
    }

    if (rawEnv) {
      const parts = rawEnv.split(/[,+ ]+/).map((p) => p.trim());
      for (const part of parts) {
        if (part === "verbose" || part === "all") {
          this.activeCategories.add("verbose");
          this.activeCategories.add("process");
          this.activeCategories.add("traffic");
          this.activeCategories.add("traffic-pending");
          this.activeCategories.add("debug");
        } else if (part === "traffic") {
          this.activeCategories.add("traffic");
        } else if (part === "traffic-pending" || part === "traffic:pending") {
          this.activeCategories.add("traffic-pending");
        } else if (part === "debug") {
          this.activeCategories.add("debug");
        } else if (part === "process") {
          this.activeCategories.add("process");
        }
      }
      return;
    }

    // Default per environment
    if (nodeEnv === "development" || !nodeEnv) {
      // Default for dev: verbose (everything)
      this.activeCategories.add("verbose");
      this.activeCategories.add("process");
      this.activeCategories.add("traffic");
      this.activeCategories.add("traffic-pending");
      this.activeCategories.add("debug");
    } else if (nodeEnv === "test") {
      // Default for test: traffic + process
      this.activeCategories.add("traffic");
      this.activeCategories.add("process");
    } else if (nodeEnv === "production") {
      // Default for prod: no logging (silent) unless configured
      this.explicitSilent = true;
    }
  }

  public isEnabled(category: LogCategory): boolean {
    if (this.explicitSilent) return false;
    return this.activeCategories.has(category);
  }

  public isVerbose(): boolean {
    return this.isEnabled("verbose");
  }

  public isTraffic(): boolean {
    return this.isEnabled("traffic");
  }

  public isTrafficPending(): boolean {
    return this.isEnabled("traffic-pending");
  }

  public isDebug(): boolean {
    return this.isEnabled("debug");
  }

  public isProcess(): boolean {
    return this.isEnabled("process");
  }

  public isSilent(): boolean {
    return this.explicitSilent || this.activeCategories.size === 0;
  }

  public verbose(...args: any[]): void {
    if (this.isVerbose()) {
      betterConsole.log(...args);
    }
  }

  public process(...args: any[]): void {
    if (this.isProcess()) {
      betterConsole.log(...args);
    }
  }

  public traffic(...args: any[]): void {
    if (this.isTraffic()) {
      betterConsole.log(...args);
    }
  }

  public trafficPending(...args: any[]): void {
    if (this.isTrafficPending()) {
      betterConsole.log(...args);
    }
  }

  public debug(...args: any[]): void {
    if (this.isDebug()) {
      betterConsole.log(...args);
    }
  }

  public info(...args: any[]): void {
    if (this.isProcess() || this.isVerbose()) {
      betterConsole.log(...args);
    }
  }

  public warn(...args: any[]): void {
    if (!this.isSilent()) {
      betterConsole.log(...args);
    }
  }

  public error(...args: any[]): void {
    if (!this.isSilent()) {
      betterConsole.error(...args);
    }
  }
}

export const logger = new Logger();

/**
 * Backward-compatible helper for debug logs
 */
export function logDev(...args: any[]) {
  logger.debug(...args);
}
