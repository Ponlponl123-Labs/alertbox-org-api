import betterConsole from "ts-better-console";

/**
 * Log verbose debug messages only in development environment.
 */
export function logDev(...args: any[]) {
  if (process.env.NODE_ENV === "development") {
    betterConsole.log(...args);
  }
}
