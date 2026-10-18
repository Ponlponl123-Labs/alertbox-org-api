import { SQL } from "bun";
import { dbConfig, nodeEnv } from "@/config/env";
import { logger } from "@/utils/log";
import betterConsole, { Card, cs, s, tsflag } from "ts-better-console";

export * from "./enums";
export * from "./types";

const buildTlsOptions = () => {
  if (!dbConfig.ssl) return undefined;
  if (typeof dbConfig.ssl === "object") {
    const hasCa = typeof dbConfig.ssl.ca === "string" && dbConfig.ssl.ca.trim().length > 0;
    const hasCert = typeof dbConfig.ssl.cert === "string" && dbConfig.ssl.cert.trim().length > 0;
    const hasKey = typeof dbConfig.ssl.key === "string" && dbConfig.ssl.key.trim().length > 0;
    if (!hasCa && !hasCert && !hasKey) return undefined;

    return {
      ca: hasCa ? Bun.file(dbConfig.ssl.ca) : undefined,
      cert: hasCert ? Bun.file(dbConfig.ssl.cert) : undefined,
      key: hasKey ? Bun.file(dbConfig.ssl.key) : undefined,
      rejectUnauthorized: dbConfig.ssl.rejectUnauthorized !== false,
      ...(dbConfig.ssl.checkServerIdentity
        ? { checkServerIdentity: dbConfig.ssl.checkServerIdentity }
        : {}),
    };
  }
  return { rejectUnauthorized: true };
};

logger.process(
  tsflag(
    "info",
    true,
    "· Initializing native Bun.SQL connection pool (mTLS enabled)...",
  ),
);

export const sql = new SQL({
  adapter: "mysql",
  hostname: dbConfig.host,
  port: dbConfig.port,
  username: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  max: process.platform === "win32" ? 1 : 10,
  idleTimeout: 30,
  bigint: true,
  tls: buildTlsOptions(),
});

(sql as any).destroy = () => sql.close();

import { Kysely } from "kysely";
import { BunSqlDialect } from "./dialect";
import type { DB } from "./types";

export const db = new Kysely<DB>({
  dialect: new BunSqlDialect(),
});

export const dbTransaction = <T>(
  fn: (tx: typeof sql) => Promise<T>,
): Promise<T> => sql.begin(fn as any);

let isConnected = false;

export async function verifyConnection() {
  try {
    logger.process(
      tsflag(
        "info",
        true,
        s("··· Connecting to MariaDB Galera cluster via native Bun.SQL", {
          color: "yellow",
        }),
      ),
    );
    await sql`SELECT 1`;
    isConnected = true;
    logger.process(
      tsflag(
        "info",
        true,
        s("✓ Database connection established successfully via native Bun.SQL!", {
          color: "green",
        }),
      ),
    );
  } catch (error) {
    logger.error(
      tsflag(
        "error",
        true,
        cs([
          "Failed to connect to the database via native Bun.SQL:",
          s(String(error), { color: "red" }),
        ]),
      ),
    );
    process.exit(1);
  }
}

export default sql;
