import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { createPool, Pool, PoolConnection } from "mariadb";
import { dbConfig } from "../src/config/env";

interface ExplainRow {
  id: number;
  select_type: string;
  table: string;
  type: string;
  possible_keys: string | null;
  key: string | null;
  key_len: string | null;
  ref: string | null;
  rows: number;
  Extra: string;
}

let pool: Pool;
let conn: PoolConnection;

async function getSessionStatus(connection: PoolConnection): Promise<Record<string, number>> {
  const rows = await connection.query(
    "SHOW SESSION STATUS WHERE Variable_name IN ('Handler_read_rnd_next', 'Handler_read_first', 'Handler_read_key', 'Handler_read_next', 'Innodb_buffer_pool_read_requests', 'Innodb_buffer_pool_reads')"
  );
  const map: Record<string, number> = {};
  for (const r of rows) {
    map[r.Variable_name] = parseInt(r.Value, 10) || 0;
  }
  return map;
}

interface QueryMetric {
  query: string;
  table: string;
  scans: number;
  logicalReads: number;
  physicalReads: number;
  timeMs: string;
  index: string;
  status: string;
}

const metricsReport: QueryMetric[] = [];

async function inspectQuery(label: string, sql: string) {
  const explain: ExplainRow[] = await conn.query(`EXPLAIN ${sql}`);

  const before = await getSessionStatus(conn);
  const start = performance.now();
  await conn.query(sql);
  const durationMs = performance.now() - start;
  const after = await getSessionStatus(conn);

  const tableScans = Math.max(0, (after.Handler_read_rnd_next ?? 0) - (before.Handler_read_rnd_next ?? 0));
  const indexScans = Math.max(0, (after.Handler_read_first ?? 0) - (before.Handler_read_first ?? 0));
  const scanCount = tableScans + indexScans;
  const indexLookups = Math.max(0, (after.Handler_read_key ?? 0) - (before.Handler_read_key ?? 0));
  const logicalReads = Math.max(0, (after.Innodb_buffer_pool_read_requests ?? 0) - (before.Innodb_buffer_pool_read_requests ?? 0));
  const physicalReads = Math.max(0, (after.Innodb_buffer_pool_reads ?? 0) - (before.Innodb_buffer_pool_reads ?? 0));
  const hasFullTableScan = explain.some((r) => r.type === "ALL");
  const keyUsed = explain.map((r) => `${r.table}:${r.key || "NONE"}(${r.type})`).join(", ");

  const table = explain[0]?.table || sql.match(/FROM\s+[`"]?([A-Za-z0-9_]+)[`"]?/i)?.[1] || "table";
  const status = (!hasFullTableScan && scanCount === 0) ? "PASS" : "WARN";

  metricsReport.push({
    query: label,
    table,
    scans: scanCount,
    logicalReads,
    physicalReads,
    timeMs: `${durationMs.toFixed(2)}ms`,
    index: keyUsed,
    status,
  });

  const statsSummary = `Table '${table}' | Scans: ${scanCount} | Logical: ${logicalReads} | Physical: ${physicalReads} | Time: ${durationMs.toFixed(2)}ms`;
  console.log(`    📊 [${label}] ${statsSummary}`);

  return {
    explain,
    keyUsed,
    tableScans,
    scanCount,
    indexLookups,
    logicalReads,
    physicalReads,
    durationMs,
    statsSummary,
    hasFullTableScan,
  };
}

describe("MariaDB Galera Performance & Index Verification (All Prisma Queries)", () => {
  beforeAll(async () => {
    pool = createPool({
      host: process.env.TEST_DB_HOST || dbConfig.host || "mariadb-galera.mariadb-galera.svc.cluster.local",
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      connectionLimit: 5,
    });
    conn = await pool.getConnection();
  }, 10000);

  afterAll(async () => {
    if (conn) conn.release();
    if (pool) await pool.end();
    if (metricsReport.length > 0) {
      console.log("\n======================== MARIADB GALERA I/O PERFORMANCE SUMMARY ========================");
      console.table(metricsReport);
      console.log("========================================================================================\n");
    }
  });

  describe("Database Cluster / Server State", () => {
    it("database connection is healthy and responsive", async () => {
      const rows = await conn.query(
        "SHOW STATUS WHERE Variable_name IN ('wsrep_cluster_size', 'wsrep_ready', 'wsrep_connected', 'Uptime')"
      );
      const status: Record<string, string> = {};
      for (const r of rows) status[r.Variable_name] = r.Value;

      if (status.wsrep_connected === "ON") {
        expect(status.wsrep_ready).toBe("ON");
        expect(parseInt(status.wsrep_cluster_size, 10)).toBeGreaterThanOrEqual(1);
      } else {
        expect(parseInt(status.Uptime || "0", 10)).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("User & Account Queries (account.ts, core.ts, discord.ts)", () => {
    it("isExist: User lookup by email [scans: 0, logical: 1, physical: 0]", async () => {
      const res = await inspectQuery(
        "User.isExist",
        "SELECT id, disabledAt, deletedAt FROM `User` WHERE email = 'test@example.com' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("User_email_key");
    });

    it("load / use: User lookup by id [scans: 0, logical: 1, physical: 0]", async () => {
      const res = await inspectQuery(
        "User.byId",
        "SELECT id, email, createWith, createdAt, disabledAt, deletedAt FROM `User` WHERE id = 'sample-uid' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("PRIMARY");
    });
  });

  describe("Session & Device Queries (core.ts, session.ts, device.ts)", () => {
    it("use: Session auth lookup by token with user existence [scans: 0, logical: 1, physical: 0]", async () => {
      const res = await inspectQuery(
        "Session.auth",
        "SELECT s.id, s.userId, s.ipAddress, s.disabledAt, s.expiresAt, u.id AS u_id " +
        "FROM `Session` s LEFT JOIN `User` u ON s.userId = u.id AND s.userSecret = u.secret " +
        "WHERE s.token = 'sample-token' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(3);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      expect(res.explain.every((r) => r.type !== "ALL")).toBe(true);
    });

    it("devices.list: Active sessions by userId [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "Session.byUser",
        "SELECT id, createdAt, ipAddress, userAgent FROM `Session` " +
        "WHERE userId = 'sample-uid' AND disabledAt IS NULL AND expiresAt > NOW()"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      expect(res.explain.every((r) => r.type !== "ALL")).toBe(true);
    });

    it("devices.list: SessionUsage latest per session [scans: 0, logical: 4, physical: 0]", async () => {
      const res = await inspectQuery(
        "SessionUsage.latest",
        "SELECT createdAt FROM `SessionUsage` WHERE sessionId = 'sample-sid' ORDER BY id DESC LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });
  });

  describe("Widget Queries (widget.ts, dispatcher.ts)", () => {
    it("resolveWidgetWithSettings: Widget lookup by unique token [scans: 0, logical: 1, physical: 0]", async () => {
      const res = await inspectQuery(
        "Widget.byToken",
        "SELECT id, type, deletedAt FROM `Widget` WHERE token = 'sample-widget-token' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("Widget_token_key");
    });

    it("dispatcher: Active ALERTBOX widgets [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "Widget.activeAlertbox",
        "SELECT id FROM `Widget` WHERE userId = 'sample-uid' AND type = 'ALERTBOX' AND deletedAt IS NULL"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      expect(["ref", "range", null]).toContain(res.explain[0].type);
    });

    it("WidgetTokenLog: History ordered by createdAt [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "WidgetTokenLog.history",
        "SELECT id, oldToken, newToken, createdAt FROM `WidgetTokenLog` " +
        "WHERE widgetId = 'sample-widget' ORDER BY createdAt DESC LIMIT 10"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });
  });

  describe("Profile & URI Queries (profile.ts, account.ts)", () => {
    it("getURIOwner: ReservedUri lookup by unique uri [scans: 0, logical: 1, physical: 0]", async () => {
      const res = await inspectQuery(
        "ReservedUri.byUri",
        "SELECT createdAt, userId, disabledAt FROM `ReservedUri` WHERE uri = 'sample_slug' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("ReservedUri_uri_key");
    });

    it("deleteAccount: User active reserved URIs [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "ReservedUri.byUser",
        "SELECT id, uri FROM `ReservedUri` WHERE userId = 'sample-uid' AND deletedAt IS NULL"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });
  });

  describe("Integration & Webhook Queries (kofi.ts, bmac.ts, dispatcher.ts)", () => {
    it("dispatcher: TransactionLog deduplication lookup [scans: 0, logical: 1, physical: 0]", async () => {
      const res = await inspectQuery(
        "TransactionLog.dedup",
        "SELECT id, status FROM `TransactionLog` WHERE provider = 'stripe' AND providerTxId = 'pi_12345' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("provider");
    });

    it("TransactionLog: User transaction history ordered by createdAt [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "TransactionLog.byUser",
        "SELECT id, amount, currency, createdAt FROM `TransactionLog` " +
        "WHERE userId = 'sample-uid' ORDER BY createdAt DESC LIMIT 25"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
    });

    it("StreamlabsRelayLog: User relay history ordered by createdAt [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "StreamlabsRelayLog.byUser",
        "SELECT id, provider, status, createdAt FROM `StreamlabsRelayLog` " +
        "WHERE userId = 'sample-uid' ORDER BY createdAt DESC LIMIT 20"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
    });
  });
});
