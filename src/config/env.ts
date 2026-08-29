import betterConsole, { s, tsflag } from "ts-better-console";

const nodeEnv = (typeof Bun !== "undefined" ? Bun.env.NODE_ENV : process.env.NODE_ENV) || "production";
const isDev = nodeEnv === "development";

const envFiles = isDev
  ? [".env.development", ".env.dev", ".env.local", ".env"]
  : [".env.production", ".env.prod", ".env"];

let loadedFile: string | null = null;

if (typeof Bun !== "undefined") {
  for (const file of envFiles) {
    const f = Bun.file(file);
    if (f.size > 0) {
      loadedFile = file;
      break;
    }
  }
}

// Log the status with high visibility
betterConsole.log(
  tsflag(
    "info",
    true,
    s(`Active Environment: ${nodeEnv}`, { styles: ["bold"] }),
  ),
);

if (loadedFile) {
  betterConsole.log(
    tsflag(
      "info",
      true,
      s(`✓ Environment variables loaded from: ${loadedFile}`, {
        color: "green",
      }),
    ),
  );
} else {
  betterConsole.log(
    tsflag(
      "warn",
      true,
      s("⚠ No .env file found. Using system environment variables.", {
        color: "yellow",
      }),
    ),
  );
}

/**
 * Database Configuration
 * Centralized parsing of DB environment variables.
 */
export const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "3306"),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "mydb",
  get url() {
    return (
      process.env.DATABASE_URL ||
      `mysql://${this.user}:${this.password}@${this.host}:${this.port}/${this.database}`
    );
  },
};

/**
 * Redis Configuration
 */
export const redisConfig = {
  password: process.env.REDIS_PASSWORD || undefined,
  sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD || undefined,
};

export { nodeEnv, isDev, loadedFile };
