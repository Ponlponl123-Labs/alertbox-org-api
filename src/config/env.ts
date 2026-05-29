import betterConsole, { tsflag } from "ts-better-console";

const nodeEnv = process.env.NODE_ENV || "development";
const isDev = nodeEnv === "development";

// Priority list for environment files to check for logging purposes
const envFiles = isDev
  ? [".env.development", ".env.dev", ".env.local", ".env"]
  : [".env.production", ".env.prod", ".env"];

let loadedFile: string | null = null;

for (const file of envFiles) {
  const f = Bun.file(file);
  if (f.size > 0) {
    loadedFile = file;
    break;
  }
}

// Log the status with high visibility
betterConsole.log(tsflag("info", true, `Active Environment: ${nodeEnv}`));

if (loadedFile) {
  betterConsole.log(
    tsflag("info", true, `✓ Environment variables loaded from: ${loadedFile}`),
  );
} else {
  betterConsole.log(
    tsflag(
      "warn",
      true,
      "⚠ No .env file found. Using system environment variables.",
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

export { nodeEnv, isDev, loadedFile };
