import fs from "fs";
import path from "path";
import betterConsole, { s, tsflag } from "ts-better-console";

const explicitEnv = typeof Bun !== "undefined" ? Bun.env.NODE_ENV : process.env.NODE_ENV;
let nodeEnv = explicitEnv;

if (!nodeEnv) {
  if (
    fs.existsSync(".env.development.local") ||
    fs.existsSync(".env.development") ||
    fs.existsSync(".env.local")
  ) {
    nodeEnv = "development";
  } else {
    nodeEnv = "production";
  }
}

const isDev = nodeEnv === "development";

const envFiles = isDev
  ? [".env.development.local", ".env.development", ".env.dev", ".env.local", ".env"]
  : [".env.production.local", ".env.production", ".env.prod", ".env.local", ".env"];

let loadedFile: string | null = null;

function loadEnvFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) return false;
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.slice(0, eqIdx).trim();
      let val = line.slice(eqIdx + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
    return true;
  } catch {
    return false;
  }
}

for (const file of envFiles) {
  if (loadEnvFile(file)) {
    loadedFile = file;
    break;
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
  get host() {
    return process.env.DB_HOST || "localhost";
  },
  get port() {
    return parseInt(process.env.DB_PORT || "3306");
  },
  get user() {
    return process.env.DB_USER || "root";
  },
  get password() {
    return process.env.DB_PASS || "";
  },
  get database() {
    return process.env.DB_NAME || "mydb";
  },
  get url() {
    return (
      process.env.DATABASE_URL ||
      `mysql://${this.user}:${encodeURIComponent(this.password)}@${this.host}:${this.port}/${this.database}`
    );
  },
};

export const migrationDbConfig = {
  get user() {
    return process.env.DB_MIGRATION_USER || process.env.MIGRATION_DB_USER || dbConfig.user;
  },
  get password() {
    return process.env.DB_MIGRATION_PASS || process.env.MIGRATION_DB_PASS || dbConfig.password;
  },
  get host() {
    return process.env.DB_MIGRATION_HOST || process.env.MIGRATION_DB_HOST || dbConfig.host;
  },
  get port() {
    return parseInt(process.env.DB_MIGRATION_PORT || process.env.MIGRATION_DB_PORT || String(dbConfig.port));
  },
  get database() {
    return process.env.DB_MIGRATION_NAME || process.env.MIGRATION_DB_NAME || dbConfig.database;
  },
  get url() {
    return (
      process.env.MIGRATION_DATABASE_URL ||
      process.env.DATABASE_URL ||
      `mysql://${this.user}:${encodeURIComponent(this.password)}@${this.host}:${this.port}/${this.database}`
    );
  },
  get shadowUrl() {
    if (process.env.SHADOW_DATABASE_URL) return process.env.SHADOW_DATABASE_URL;
    const shadowDb = process.env.DB_MIGRATION_SHADOW_NAME || process.env.SHADOW_DB_NAME;
    return shadowDb
      ? `mysql://${this.user}:${encodeURIComponent(this.password)}@${this.host}:${this.port}/${shadowDb}`
      : undefined;
  },
};

/**
 * Redis Configuration
 */
export const redisConfig = {
  get password() {
    return process.env.REDIS_PASSWORD || undefined;
  },
  get sentinelPassword() {
    return process.env.REDIS_SENTINEL_PASSWORD || undefined;
  },
};

export { nodeEnv, isDev, loadedFile };
