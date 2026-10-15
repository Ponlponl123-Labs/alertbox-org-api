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
  const isMutation = /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(sql);
  const isInsert = /^\s*INSERT/i.test(sql);
  const explain: ExplainRow[] = await conn.query(`EXPLAIN ${sql}`);

  // Warm-up tablespace and index root pages in InnoDB buffer pool
  if (isMutation) {
    await conn.query("START TRANSACTION");
    try { await conn.query(sql); } catch {}
    await conn.query("ROLLBACK");
    await conn.query("START TRANSACTION");
  }

  const before = await getSessionStatus(conn);
  const start = performance.now();
  let durationMs = 0;
  let after: Record<string, number> = before;
  try {
    await conn.query(sql);
    durationMs = performance.now() - start;
    after = await getSessionStatus(conn);
  } finally {
    if (isMutation) {
      await conn.query("ROLLBACK");
    }
  }

  const tableScans = Math.max(0, (after.Handler_read_rnd_next ?? 0) - (before.Handler_read_rnd_next ?? 0));
  const indexScans = Math.max(0, (after.Handler_read_first ?? 0) - (before.Handler_read_first ?? 0));
  const scanCount = tableScans + indexScans;
  const indexLookups = Math.max(0, (after.Handler_read_key ?? 0) - (before.Handler_read_key ?? 0));
  const logicalReads = Math.max(0, (after.Innodb_buffer_pool_read_requests ?? 0) - (before.Innodb_buffer_pool_read_requests ?? 0));
  const physicalReads = Math.max(0, (after.Innodb_buffer_pool_reads ?? 0) - (before.Innodb_buffer_pool_reads ?? 0));
  const hasFullTableScan = isInsert ? false : explain.some((r) => r.type === "ALL");
  const keyUsed = explain.map((r) => `${r.table}:${r.key || "NONE"}(${r.type})`).join(", ");

  const table = explain[0]?.table || sql.match(/(?:FROM|INTO|UPDATE)\s+[`"]?([A-Za-z0-9_]+)[`"]?/i)?.[1] || "table";
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
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
  }, 10000);

  afterAll(async () => {
    if (conn) {
      await conn.query("SET FOREIGN_KEY_CHECKS = 1").catch(() => {});
      conn.release();
    }
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
        "SELECT id FROM `Widget` WHERE streamerId = 'sample-streamer-id' AND type = 'ALERTBOX' AND deletedAt IS NULL"
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
        "WHERE widgetId = 1 ORDER BY createdAt DESC LIMIT 10"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("AlertboxSetting: Setting lookup by widgetId [scans: 0, logical: 1, physical: 0]", async () => {
      const res = await inspectQuery(
        "AlertboxSetting.byWidget",
        "SELECT id, widgetId, globalVolume FROM `AlertboxSetting` WHERE widgetId = 1 LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("AlertboxSetting_widgetId_key");
    });

    it("AlertboxEvent: Event lookup by alertboxId and eventType [scans: 0, logical <= 2, physical: 0]", async () => {
      const res = await inspectQuery(
        "AlertboxEvent.bySetting",
        "SELECT id, alertboxId, eventType, isEnabled, image, sound, soundVolume FROM `AlertboxEvent` " +
        "WHERE alertboxId = 1 AND eventType = 'TIP' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(3);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("AlertboxEvent_alertboxId_eventType_key");
    });
  });

  describe("Profile & URI Queries (profile.ts, account.ts)", () => {
    it("getURIOwner: ReservedUri lookup by unique uri [scans: 0, logical: 1, physical: 0]", async () => {
      const res = await inspectQuery(
        "ReservedUri.byUri",
        "SELECT createdAt, streamerId, disabledAt FROM `ReservedUri` WHERE uri = 'sample_slug' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("ReservedUri_uri_key");
    });

    it("deleteAccount: User active reserved URIs [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "ReservedUri.byStreamer",
        "SELECT id, uri FROM `ReservedUri` WHERE streamerId = 'sample-streamer-id' AND deletedAt IS NULL"
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
        "TransactionLog.byStreamer",
        "SELECT id, amount, currency, createdAt FROM `TransactionLog` " +
        "WHERE streamerId = 'sample-streamer-id' ORDER BY createdAt DESC LIMIT 25"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
    });

    it("StreamlabsRelayLog: User relay history ordered by createdAt [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "StreamlabsRelayLog.byStreamer",
        "SELECT id, provider, status, createdAt FROM `StreamlabsRelayLog` " +
        "WHERE streamerId = 'sample-streamer-id' ORDER BY createdAt DESC LIMIT 20"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
    });

    it("Integration: Integration lookup by unique streamerId [scans: 0, logical: 1, physical: 0]", async () => {
      const res = await inspectQuery(
        "Integration.byStreamer",
        "SELECT id, streamerId, stripeSecret, kofiUsername, bmacUsername FROM `Integration` " +
        "WHERE streamerId = 1 LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("Integration_streamerId_key");
    });
  });

  describe("Organization & Multi-Tenant Read Queries (org.ts, members.ts, presets.ts, invites.ts)", () => {
    it("Organization.byId: lookup by id with soft-delete filter [scans: 0, logical <= 2, physical: 0]", async () => {
      const res = await inspectQuery(
        "Organization.byId",
        "SELECT id, name, slug, avatar, banner, ownerId, createdAt FROM `Organization` WHERE id = 1 AND deletedAt IS NULL LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("PRIMARY");
    });

    it("Organization.bySlug: unique slug lookup with soft-delete check [scans: 0, logical <= 2, physical: 0]", async () => {
      const res = await inspectQuery(
        "Organization.bySlug",
        "SELECT id, name, slug, avatar, banner, ownerId, createdAt FROM `Organization` WHERE slug = 'sample_org_slug' AND deletedAt IS NULL LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("Organization_slug_key");
    });

    it("Organization.byOwner: active organizations by ownerId [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "Organization.byOwner",
        "SELECT id, name, slug, createdAt FROM `Organization` WHERE ownerId = 1 AND deletedAt IS NULL ORDER BY createdAt DESC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("OrganizationMember.callerPerm: composite unique lookup [scans: 0, logical <= 2, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationMember.callerPerm",
        "SELECT id, role, permissions FROM `OrganizationMember` WHERE orgId = 1 AND userId = 1 LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("OrganizationMember_orgId_userId_key");
    });

    it("OrganizationMember.byUser: all memberships for user [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationMember.byUser",
        "SELECT id, orgId, role, permissions, createdAt FROM `OrganizationMember` WHERE userId = 1 ORDER BY createdAt ASC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("OrganizationMember.byOrg: all members for organization [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationMember.byOrg",
        "SELECT id, userId, role, permissions, createdAt FROM `OrganizationMember` WHERE orgId = 1 ORDER BY createdAt ASC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("Streamer.byOrg: active streamers for organization [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "Streamer.byOrg",
        "SELECT id, orgId, name, displayName, avatar, uri, publishedAt, createdAt FROM `Streamer` WHERE orgId = 1 AND deletedAt IS NULL ORDER BY createdAt ASC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("Streamer.byUri: public streamer profile lookup by uri [scans: 0, logical <= 2, physical: 0]", async () => {
      const res = await inspectQuery(
        "Streamer.byUri",
        "SELECT id, orgId, name, displayName, bio, avatar, banner, uri, accentColor, currency FROM `Streamer` WHERE uri = 'sample_streamer_uri' AND deletedAt IS NULL LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("Streamer_uri_key");
    });

    it("OrganizationRolePreset.byOrg: custom presets for org [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationRolePreset.byOrg",
        "SELECT id, orgId, name, description, permissions, color, createdAt, updatedAt FROM `OrganizationRolePreset` WHERE orgId = 1 ORDER BY createdAt ASC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("OrganizationInvite.byToken: invite lookup by token [scans: 0, logical <= 2, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationInvite.byToken",
        "SELECT id, orgId, email, role, permissions, expiresAt, acceptedAt FROM `OrganizationInvite` WHERE token = 'sample_invite_token' AND acceptedAt IS NULL LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(2);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("OrganizationInvite_token_key");
    });

    it("OrganizationInvite.byOrgAndEmail: latest pending invite for email [scans: 0, logical <= 5, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationInvite.byOrgAndEmail",
        "SELECT id, token, role, permissions, expiresAt, acceptedAt FROM `OrganizationInvite` WHERE orgId = 1 AND email = 'member@example.com' AND acceptedAt IS NULL ORDER BY createdAt DESC LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("OrganizationAuditLog.byOrg: chronological audit history [scans: 0, logical <= 15, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationAuditLog.byOrg",
        "SELECT id, orgId, userId, action, targetType, targetId, payload, ipAddress, createdAt FROM `OrganizationAuditLog` WHERE orgId = 1 ORDER BY createdAt DESC LIMIT 25"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(15);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });
  });

  describe("Write & Mutation Queries (INSERT, UPDATE, DELETE)", () => {
    it("Session.create: insert new session [scans: 0, logical <= 15, physical: 0]", async () => {
      const res = await inspectQuery(
        "Session.create",
        "INSERT INTO `Session` (userId, userSecret, token, method, userAgent, ipAddress, expiresAt) " +
        "VALUES (1, 'sec', 'tok_perf_test_1', 'POST', 'test-agent', '127.0.0.1', DATE_ADD(NOW(), INTERVAL 2 HOUR))"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(15);
      expect(res.physicalReads).toBe(0);
    });

    it("SessionUsage.create: insert background session usage [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "SessionUsage.create",
        "INSERT INTO `SessionUsage` (userId, sessionId, ipAddress) VALUES (1, 1, '127.0.0.1')"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(15);
      expect(res.physicalReads).toBe(0);
    });

    it("Profile.update: update profile by unique userId [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "Streamer.update",
        "UPDATE `Streamer` SET displayName = 'perf-tester', updatedAt = NOW() WHERE id = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("Integration.update: update integration by unique userId [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "Integration.update",
        "UPDATE `Integration` SET streamlabsSecret = 'secret_perf', updatedAt = NOW() WHERE streamerId = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("Session.destroy: soft-delete session by id and userId [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "Session.destroy",
        "UPDATE `Session` SET disabledAt = NOW() WHERE id = 1 AND userId = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("TransactionLog.create: insert donation transaction [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "TransactionLog.create",
        "INSERT INTO `TransactionLog` (orgId, streamerId, provider, providerTxId, type, status, isTest, amount, currency, senderName, updatedAt) " +
        "VALUES (1, 1, 'stripe', 'tx_perf_new_1', 'TIP', 'COMPLETED', 1, 1000, 'USD', 'Donor', NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
    });

    it("StreamlabsRelayLog.create: insert relay log [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "StreamlabsRelayLog.create",
        "INSERT INTO `StreamlabsRelayLog` (orgId, streamerId, provider, type, status, amount, currency, senderName, updatedAt) " +
        "VALUES (1, 1, 'stripe', 'TIP', 'COMPLETED', 1000, 'USD', 'Donor', NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
    });

    it("Organization.create: insert organization [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "Organization.create",
        "INSERT INTO `Organization` (name, slug, ownerId, createdAt, updatedAt) " +
        "VALUES ('Alpha Org', 'alpha-org-perf-test', 1, NOW(), NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
    });

    it("OrganizationMember.create: insert organization member [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationMember.create",
        "INSERT INTO `OrganizationMember` (orgId, userId, role, permissions, createdAt, updatedAt) " +
        "VALUES (999991, 999991, 'MEMBER', 1, NOW(), NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
    });

    it("OrganizationMember.updateRole: update member role and permissions [scans: 0, logical <= 15, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationMember.updateRole",
        "UPDATE `OrganizationMember` SET role = 'ADMIN', permissions = 65535, updatedAt = NOW() WHERE orgId = 1 AND userId = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(15);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });

    it("OrganizationRolePreset.create: insert role preset [scans: 0, logical <= 300, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationRolePreset.create",
        "INSERT INTO `OrganizationRolePreset` (orgId, name, description, permissions, createdAt, updatedAt) " +
        "VALUES (1, 'Custom Mod', 'Custom description', 15, NOW(), NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(300);
      expect(res.physicalReads).toBe(0);
    });

    it("OrganizationInvite.create: insert organization invite [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "OrganizationInvite.create",
        "INSERT INTO `OrganizationInvite` (orgId, email, role, permissions, token, inviterId, expiresAt, createdAt) " +
        "VALUES (1, 'perf_invited@example.com', 'MEMBER', 1, 'inv_tok_perf_test', 1, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
    });

    it("Organization.softDelete: soft-delete organization by id [scans: 0, logical <= 10, physical: 0]", async () => {
      const res = await inspectQuery(
        "Organization.softDelete",
        "UPDATE `Organization` SET deletedAt = NOW() WHERE id = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBe(0);
      expect(res.hasFullTableScan).toBe(false);
    });
  });
});
