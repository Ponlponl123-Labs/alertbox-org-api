import tls from "node:tls";
if (tls?.TLSSocket?.prototype?.getPeerCertificate) {
  const orig = tls.TLSSocket.prototype.getPeerCertificate;
  (tls.TLSSocket.prototype as any).getPeerCertificate = function (this: any, detailed?: boolean) {
    const cert = orig.call(this, detailed as any);
    if (cert && typeof cert === "object" && !cert.fingerprint256) cert.fingerprint256 = "";
    return cert;
  };
}

import fs from "fs";
import betterConsole, { s, tsflag } from "ts-better-console";

const explicitEnv = typeof Bun !== "undefined" ? Bun.env.NODE_ENV : process.env.NODE_ENV;
let nodeEnv: string =
  explicitEnv ||
  (fs.existsSync(".env.development.local") ||
    fs.existsSync(".env.development") ||
    fs.existsSync(".env.local")
    ? "development"
    : "production");

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

const formatDbUrl = (cfg: {
  user: string;
  password?: string;
  host: string;
  port: number;
  database: string;
  sslMode?: string;
  sslCa?: string;
  sslCert?: string;
}) => {
  const auth = cfg.password ? `${cfg.user}:${encodeURIComponent(cfg.password)}` : cfg.user;
  const base = `mysql://${auth}@${cfg.host}:${cfg.port}/${cfg.database}`;
  const params = new URLSearchParams();
  if (cfg.sslMode) {
    const modeMap: Record<string, string> = {
      required: "require",
      require: "require",
      verify_ca: "verify-ca",
      "verify-ca": "verify-ca",
      verify_identity: "verify-identity",
      "verify-identity": "verify-identity",
      "verify-full": "verify-identity",
      preferred: "prefer",
      prefer: "prefer",
      disabled: "disable",
      disable: "disable",
    };
    const mapped = modeMap[cfg.sslMode.toLowerCase()] || cfg.sslMode.toLowerCase();
    params.set("sslmode", mapped);
    if (mapped === "require" && !cfg.sslCa) {
      params.set("sslaccept", "accept_invalid_certs");
    }
  }
  if (cfg.sslCa) params.set("sslcert", cfg.sslCa);
  if (cfg.sslCert) params.set("sslidentity", cfg.sslCert);
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
};

const buildMariaDbSsl = (cfg: {
  sslMode?: string;
  sslCa?: string;
  sslCert?: string;
  sslKey?: string;
}) => {
  if (!cfg.sslMode && !cfg.sslCa && !cfg.sslCert && !cfg.sslKey) return undefined;
  const mode = cfg.sslMode?.toLowerCase();
  if (mode === "disabled" || mode === "disable" || mode === "false") return false;

  const readCert = (val?: string) => (val && fs.existsSync(val) ? fs.readFileSync(val) : val);
  const ssl: Record<string, any> = {};
  const isVerifyFull = mode === "verify-identity" || mode === "verify_identity" || mode === "verify-full";
  const isVerifyCa = mode === "verify-ca" || mode === "verify_ca";

  if (isVerifyFull) {
    ssl.rejectUnauthorized = true;
  } else if (isVerifyCa) {
    ssl.rejectUnauthorized = true;
    ssl.checkServerIdentity = () => undefined;
  } else {
    ssl.rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED === "true";
    ssl.checkServerIdentity = () => undefined;
  }

  if (process.env.DB_SSL_REJECT_UNAUTHORIZED !== undefined) {
    ssl.rejectUnauthorized =
      process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" &&
      process.env.DB_SSL_REJECT_UNAUTHORIZED !== "0";
  }

  if (cfg.sslCa) ssl.ca = readCert(cfg.sslCa);
  if (cfg.sslCert) ssl.cert = readCert(cfg.sslCert);
  if (cfg.sslKey) ssl.key = readCert(cfg.sslKey);

  return Object.keys(ssl).length > 0 ? ssl : true;
};

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
  get sslMode() {
    return process.env.DB_SSL_MODE || undefined;
  },
  get sslCa() {
    return process.env.DB_SSL_CA || undefined;
  },
  get sslCert() {
    return process.env.DB_SSL_CC || undefined;
  },
  get sslKey() {
    return process.env.DB_SSL_CK || undefined;
  },
  get isSslRequired() {
    const mode = this.sslMode?.toLowerCase();
    return !!(mode && mode !== "disabled" && mode !== "disable" && mode !== "false") || !!this.sslCert || !!this.sslCa;
  },
  get ssl() {
    return buildMariaDbSsl(this);
  },
  get url() {
    return process.env.DATABASE_URL || formatDbUrl(this);
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
  get sslMode() {
    return process.env.DB_MIGRATION_SSL_MODE || process.env.MIGRATION_DB_SSL_MODE || dbConfig.sslMode;
  },
  get sslCa() {
    return process.env.DB_MIGRATION_SSL_CA || process.env.MIGRATION_DB_SSL_CA || dbConfig.sslCa;
  },
  get sslCert() {
    return process.env.DB_MIGRATION_SSL_CC || process.env.MIGRATION_DB_SSL_CC || dbConfig.sslCert;
  },
  get sslKey() {
    return process.env.DB_MIGRATION_SSL_CK || process.env.MIGRATION_DB_SSL_CK || dbConfig.sslKey;
  },
  get isSslRequired() {
    const mode = this.sslMode?.toLowerCase();
    return !!(mode && mode !== "disabled" && mode !== "disable" && mode !== "false") || !!this.sslCert || !!this.sslCa;
  },
  get ssl() {
    return buildMariaDbSsl(this);
  },
  get url() {
    return process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL || formatDbUrl(this);
  },
  get shadowUrl(): string | undefined {
    if (process.env.SHADOW_DATABASE_URL) return process.env.SHADOW_DATABASE_URL;
    const shadowDb = process.env.DB_MIGRATION_SHADOW_NAME || process.env.SHADOW_DB_NAME;
    return shadowDb
      ? formatDbUrl({
          user: this.user,
          password: this.password,
          host: this.host,
          port: this.port,
          database: shadowDb,
          sslMode: this.sslMode,
          sslCa: this.sslCa,
          sslCert: this.sslCert,
        })
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
  get tls() {
    return process.env.REDIS_TLS || process.env.REDIS_SSL || undefined;
  },
  get tlsCa() {
    return process.env.REDIS_TLS_CA || process.env.REDIS_SSL_CA || undefined;
  },
  get tlsCert() {
    return process.env.REDIS_TLS_CERT || process.env.REDIS_TLS_CC || process.env.REDIS_SSL_CC || undefined;
  },
  get tlsKey() {
    return process.env.REDIS_TLS_KEY || process.env.REDIS_TLS_CK || process.env.REDIS_SSL_CK || undefined;
  },
  get tlsRejectUnauthorized() {
    return process.env.REDIS_TLS_REJECT_UNAUTHORIZED || undefined;
  },
  get sentinelTls() {
    return process.env.REDIS_SENTINEL_TLS || process.env.REDIS_SENTINEL_SSL || undefined;
  },
  get sentinelTlsCa() {
    return process.env.REDIS_SENTINEL_TLS_CA || undefined;
  },
  get sentinelTlsCert() {
    return process.env.REDIS_SENTINEL_TLS_CERT || process.env.REDIS_SENTINEL_TLS_CC || undefined;
  },
  get sentinelTlsKey() {
    return process.env.REDIS_SENTINEL_TLS_KEY || process.env.REDIS_SENTINEL_TLS_CK || undefined;
  },
};

export { nodeEnv, isDev, loadedFile };