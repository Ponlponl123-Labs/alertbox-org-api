import { SQL } from "bun";
import { dbConfig, nodeEnv } from "@/config/env";
import { logger } from "@/utils/log";
import betterConsole, { Card, cs, rgb, s, tsflag } from "ts-better-console";

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

if (logger.isVerbose()) {
  new Card("· Starting native Bun.SQL Database Pool...", undefined, {
    border: {
      style: { color: rgb(90, 103, 216) },
      symbols: { style: "round" },
    },
  })
    .render()
    .split("\n")
    .forEach((line) => betterConsole.log(tsflag("info", true, line)));
}

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
    const start = performance.now();
    const rows = await sql<{ db: string; user: string; version: string }[]>`
      SELECT DATABASE() as db, USER() as user, @@version as version
    `;
    const latency = (performance.now() - start).toFixed(2);
    isConnected = true;
    logger.process(
      tsflag(
        "info",
        true,
        s(`✓ Database connection established successfully via native Bun.SQL! [${latency}ms]`, {
          color: "green",
        }),
      ),
    );

    if (logger.isVerbose()) {
      const info = rows[0];
      new Card(
        cs(
          [
            "Host: " + dbConfig.host,
            "Port: " + dbConfig.port,
            "User: " + (info?.user || dbConfig.user),
            "Database: " + (info?.db || dbConfig.database),
            "Version: " + (info?.version || "MariaDB Galera"),
            "SSL: " + (dbConfig.sslMode || (dbConfig.ssl ? "Enabled (mTLS)" : "Disabled")),
            "Pool Max: " + (process.platform === "win32" ? "1 (Windows IOCP Guard)" : "10"),
            "Ping Latency: " + latency + "ms",
          ],
          "   \n",
        ),
        undefined,
        {
          title: {
            content: `Database Connection Details`,
          },
          footer: {
            content: `· Connection Status: ${isConnected ? "Connected" : "Disconnected"}`,
            style: {
              color: isConnected ? "green" : "red",
            },
          },
          border: {
            symbols: {
              style: "round",
            },
          },
        },
      )
        .render()
        .split("\n")
        .forEach((line) => betterConsole.log(tsflag("info", true, line)));
    }
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

if (nodeEnv !== "test") {
  verifyConnection();
}

export default sql;
