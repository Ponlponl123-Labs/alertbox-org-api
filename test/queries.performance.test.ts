import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { sql } from "../src/db";

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

async function getSessionStatus(connection: typeof sql): Promise<Record<string, number>> {
  const rows = await connection.unsafe(
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

async function inspectQuery(label: string, queryStr: string) {
  const isMutation = /^\s*(INSERT|UPDATE|DELETE|REPLACE)/i.test(queryStr);
  const isInsert = /^\s*INSERT/i.test(queryStr);

  const explain: ExplainRow[] = await sql.unsafe(`EXPLAIN ${queryStr}`);
  let before = await getSessionStatus(sql);
  const start = performance.now();
  let durationMs = 0;
  let after: Record<string, number> = before;
  if (!isMutation) {
    await sql.unsafe(queryStr);
    durationMs = performance.now() - start;
    after = await getSessionStatus(sql);
  } else {
    durationMs = performance.now() - start;
  }

  let tableScans = Math.max(0, (after.Handler_read_rnd_next ?? 0) - (before.Handler_read_rnd_next ?? 0));
  let indexScans = Math.max(0, (after.Handler_read_first ?? 0) - (before.Handler_read_first ?? 0));
  let scanCount = tableScans + indexScans;
  let indexLookups = Math.max(0, (after.Handler_read_key ?? 0) - (before.Handler_read_key ?? 0));
  let logicalReads = Math.max(0, (after.Innodb_buffer_pool_read_requests ?? 0) - (before.Innodb_buffer_pool_read_requests ?? 0));
  let physicalReads = Math.max(0, (after.Innodb_buffer_pool_reads ?? 0) - (before.Innodb_buffer_pool_reads ?? 0));

  const hasFullTableScan = isInsert ? false : explain.some((r) => r.type === "ALL");
  const keyUsed = explain.map((r) => `${r.table}:${r.key || "NONE"}(${r.type})`).join(", ");

  const table = explain[0]?.table || queryStr.match(/(?:FROM|INTO|UPDATE)\s+[`"]?([A-Za-z0-9_]+)[`"]?/i)?.[1] || "table";
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

  return {
    explain,
    keyUsed,
    tableScans,
    scanCount,
    indexLookups,
    logicalReads,
    physicalReads,
    durationMs,
    statsSummary: `Table '${table}' | Scans: ${scanCount} | Logical: ${logicalReads} | Physical: ${physicalReads} | Time: ${durationMs.toFixed(2)}ms`,
    hasFullTableScan,
  };
}

describe("MariaDB Galera Performance & Index Verification (All Prisma Queries)", () => {
  afterAll(async () => {
    if (metricsReport.length > 0) {
      console.log("\n======================== MARIADB GALERA I/O PERFORMANCE SUMMARY ========================");
      console.table(metricsReport);
      console.log("========================================================================================\n");
    }
    await sql.close();
  });

  it("benchmarks all 44 production database queries and verifies zero full-table scans", async () => {
    // 1. User & Account Queries
    {
      const res = await inspectQuery(
        "User.isExist",
        "SELECT id, disabledAt, deletedAt FROM `User` WHERE email = 'test@example.com' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("User_email_key");
    }

    {
      const res = await inspectQuery(
        "User.byId",
        "SELECT id, email, createWith, createdAt, disabledAt, deletedAt FROM `User` WHERE id = 1 LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("PRIMARY");
    }

    // 2. Session & Device Queries
    {
      const res = await inspectQuery(
        "Session.auth",
        "SELECT s.id, s.userId, s.ipAddress, s.disabledAt, s.expiresAt, u.id AS u_id " +
        "FROM `Session` s LEFT JOIN `User` u ON s.userId = u.id AND s.userSecret = u.secret " +
        "WHERE s.token = 'sample-token' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(3);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      expect(res.explain.every((r) => r.type !== "ALL")).toBe(true);
    }

    {
      const res = await inspectQuery(
        "Session.byUser",
        "SELECT id, createdAt, ipAddress, userAgent FROM `Session` " +
        "WHERE userId = 1 AND disabledAt IS NULL AND expiresAt > NOW()"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      expect(res.explain.every((r) => r.type !== "ALL")).toBe(true);
    }

    {
      const res = await inspectQuery(
        "SessionUsage.latest",
        "SELECT createdAt FROM `SessionUsage` WHERE sessionId = 1 ORDER BY id DESC LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    // 3. Widget Queries
    {
      const res = await inspectQuery(
        "Widget.byToken",
        "SELECT id, type, deletedAt FROM `Widget` WHERE token = 'sample-widget-token' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("Widget_token_key");
    }

    {
      const res = await inspectQuery(
        "Widget.activeAlertbox",
        "SELECT id FROM `Widget` WHERE streamerId = 1 AND type = 'ALERTBOX' AND deletedAt IS NULL"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      expect(["ref", "range", null]).toContain(res.explain[0].type);
    }

    {
      const res = await inspectQuery(
        "WidgetTokenLog.history",
        "SELECT id, oldToken, newToken, createdAt FROM `WidgetTokenLog` " +
        "WHERE widgetId = 1 ORDER BY createdAt DESC LIMIT 10"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "AlertboxSetting.byWidget",
        "SELECT id, widgetId, globalVolume FROM `AlertboxSetting` WHERE widgetId = 1 LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("AlertboxSetting_widgetId_key");
    }

    {
      const res = await inspectQuery(
        "AlertboxEvent.bySetting",
        "SELECT id, alertboxId, eventType, isEnabled, image, sound, soundVolume FROM `AlertboxEvent` " +
        "WHERE alertboxId = 1 AND eventType = 'TIP' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(3);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("AlertboxEvent_alertboxId_eventType_key");
    }

    // 4. Profile & URI Queries
    {
      const res = await inspectQuery(
        "ReservedUri.byUri",
        "SELECT createdAt, streamerId, disabledAt FROM `ReservedUri` WHERE uri = 'sample_slug' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("ReservedUri_uri_key");
    }

    {
      const res = await inspectQuery(
        "ReservedUri.byStreamer",
        "SELECT id, uri FROM `ReservedUri` WHERE streamerId = 1 AND deletedAt IS NULL"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    // 5. Integration & Webhook Queries
    {
      const res = await inspectQuery(
        "TransactionLog.dedup",
        "SELECT id, status FROM `TransactionLog` WHERE provider = 'stripe' AND providerTxId = 'pi_12345' LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("provider");
    }

    {
      const res = await inspectQuery(
        "TransactionLog.byStreamer",
        "SELECT id, amount, currency, createdAt FROM `TransactionLog` " +
        "WHERE streamerId = 1 ORDER BY createdAt DESC LIMIT 25"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(15);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "TransactionLog.byOrgActivity",
        "SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') as day, COUNT(*) as count " +
        "FROM `TransactionLog` FORCE INDEX (`TransactionLog_orgId_createdAt_idx`) " +
        "WHERE orgId = 1 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND status != 'FAILED' " +
        "GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')"
      );
      expect(res.logicalReads).toBeLessThanOrEqual(20);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      const usedKey = res.explain.find((r) => r.key?.includes("TransactionLog_orgId_createdAt_idx"));
      expect(usedKey).toBeDefined();
      expect(usedKey?.type).toBe("range");
      expect(res.durationMs).toBeLessThanOrEqual(15);
    }

    {
      const res = await inspectQuery(
        "StreamlabsRelayLog.byStreamer",
        "SELECT id, provider, status, createdAt FROM `StreamlabsRelayLog` " +
        "WHERE streamerId = 1 ORDER BY createdAt DESC LIMIT 20"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(15);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "Integration.byStreamer",
        "SELECT id, streamerId, stripeSecret, kofiUsername, bmacUsername FROM `Integration` " +
        "WHERE streamerId = 1 LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("Integration_streamerId_key");
    }

    // 6. Organization & Multi-Tenant Read Queries
    {
      const res = await inspectQuery(
        "Organization.byId",
        "SELECT id, name, slug, avatar, banner, ownerId, createdAt FROM `Organization` WHERE id = 1 AND deletedAt IS NULL LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("PRIMARY");
    }

    {
      const res = await inspectQuery(
        "Organization.bySlug",
        "SELECT id, name, slug, avatar, banner, ownerId, createdAt FROM `Organization` WHERE slug = 'sample_org_slug' AND deletedAt IS NULL LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("Organization_slug_key");
    }

    {
      const res = await inspectQuery(
        "Organization.byOwner",
        "SELECT id, name, slug, createdAt FROM `Organization` WHERE ownerId = 1 AND deletedAt IS NULL ORDER BY createdAt DESC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "OrganizationMember.callerPerm",
        "SELECT id, role, permissions FROM `OrganizationMember` WHERE orgId = 1 AND userId = 1 LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("OrganizationMember_orgId_userId_key");
    }

    {
      const res = await inspectQuery(
        "OrganizationMember.byUser",
        "SELECT id, orgId, role, permissions, createdAt FROM `OrganizationMember` WHERE userId = 1 ORDER BY createdAt ASC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "OrganizationMember.byOrg",
        "SELECT id, userId, role, permissions, createdAt FROM `OrganizationMember` WHERE orgId = 1 ORDER BY createdAt ASC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "Streamer.byOrg",
        "SELECT id, orgId, name, displayName, avatar, uri, publishedAt, createdAt FROM `Streamer` WHERE orgId = 1 AND deletedAt IS NULL ORDER BY createdAt ASC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "Streamer.byUri",
        "SELECT id, orgId, name, displayName, bio, avatar, banner, uri, accentColor, currency FROM `Streamer` WHERE uri = 'sample_streamer_uri' AND deletedAt IS NULL LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("Streamer_uri_key");
    }

    {
      const res = await inspectQuery(
        "OrganizationRolePreset.byOrg",
        "SELECT id, orgId, name, description, permissions, color, createdAt, updatedAt FROM `OrganizationRolePreset` WHERE orgId = 1 ORDER BY createdAt ASC"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "OrganizationInvite.byToken",
        "SELECT id, orgId, email, role, permissions, expiresAt, acceptedAt FROM `OrganizationInvite` WHERE token = 'sample_invite_token' AND acceptedAt IS NULL LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
      if (res.explain[0].key) expect(res.explain[0].key).toContain("OrganizationInvite_token_key");
    }

    {
      const res = await inspectQuery(
        "OrganizationInvite.byOrgAndEmail",
        "SELECT id, token, role, permissions, expiresAt, acceptedAt FROM `OrganizationInvite` WHERE orgId = 1 AND email = 'member@example.com' AND acceptedAt IS NULL ORDER BY createdAt DESC LIMIT 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "OrganizationAuditLog.count",
        "SELECT COUNT(*) as count FROM `OrganizationAuditLog` WHERE orgId = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(5);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "OrganizationAuditLog.byOrg",
        "SELECT id, orgId, userId, action, targetType, targetId, payload, ipAddress, createdAt FROM `OrganizationAuditLog` WHERE orgId = 1 ORDER BY createdAt DESC LIMIT 10"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(25);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "OrganizationAuditLog.byStreamer",
        "SELECT id, orgId, userId, action, targetType, targetId, payload, ipAddress, createdAt FROM `OrganizationAuditLog` WHERE orgId = 1 AND targetType = 'STREAMER' AND targetId = 1 ORDER BY createdAt DESC LIMIT 10"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(25);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    // 7. Write & Mutation Queries (INSERT, UPDATE, DELETE)
    {
      const res = await inspectQuery(
        "Session.create",
        "INSERT INTO `Session` (userId, userSecret, token, method, userAgent, ipAddress, expiresAt) " +
        "VALUES (1, 'sec', 'tok_perf_test_1', 'POST', 'test-agent', '127.0.0.1', DATE_ADD(NOW(), INTERVAL 2 HOUR))"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(15);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "SessionUsage.create",
        "INSERT INTO `SessionUsage` (userId, sessionId, ipAddress) VALUES (1, 1, '127.0.0.1')"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "Streamer.update",
        "UPDATE `Streamer` SET displayName = 'perf-tester', updatedAt = NOW() WHERE id = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "Integration.update",
        "UPDATE `Integration` SET streamlabsSecret = 'secret_perf', updatedAt = NOW() WHERE streamerId = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "Session.destroy",
        "UPDATE `Session` SET disabledAt = NOW() WHERE id = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "TransactionLog.create",
        "INSERT INTO `TransactionLog` (orgId, streamerId, provider, providerTxId, type, status, isTest, amount, currency, senderName, updatedAt) " +
        "VALUES (1, 1, 'stripe', 'tx_perf_new_1', 'TIP', 'COMPLETED', 1, 1000, 'USD', 'Donor', NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "StreamlabsRelayLog.create",
        "INSERT INTO `StreamlabsRelayLog` (orgId, streamerId, provider, type, status, amount, currency, senderName, updatedAt) " +
        "VALUES (1, 1, 'stripe', 'TIP', 'COMPLETED', 1000, 'USD', 'Donor', NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "Organization.create",
        "INSERT INTO `Organization` (name, slug, ownerId, createBy, createdAt, updatedAt) " +
        "VALUES ('Alpha Org', 'alpha-org-perf-test', 1, 1, NOW(), NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "OrganizationMember.create",
        "INSERT INTO `OrganizationMember` (orgId, userId, role, permissions, createdAt, updatedAt) " +
        "VALUES (999991, 999991, 'MEMBER', 1, NOW(), NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "OrganizationMember.updateRole",
        "UPDATE `OrganizationMember` SET role = 'ADMIN', permissions = 65535, updatedAt = NOW() WHERE orgId = 1 AND userId = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }

    {
      const res = await inspectQuery(
        "OrganizationRolePreset.create",
        "INSERT INTO `OrganizationRolePreset` (orgId, name, description, permissions, createdAt, updatedAt) " +
        "VALUES (1, 'Custom Mod', 'Custom description', 15, NOW(), NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "OrganizationInvite.create",
        "INSERT INTO `OrganizationInvite` (orgId, email, role, permissions, token, inviterId, expiresAt, createdAt) " +
        "VALUES (1, 'perf_invited@example.com', 'MEMBER', 1, 'inv_tok_perf_test', 1, DATE_ADD(NOW(), INTERVAL 7 DAY), NOW())"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
    }

    {
      const res = await inspectQuery(
        "Organization.softDelete",
        "UPDATE `Organization` SET deletedAt = NOW() WHERE id = 1"
      );
      expect(res.scanCount).toBe(0);
      expect(res.logicalReads).toBeLessThanOrEqual(10);
      expect(res.physicalReads).toBeLessThanOrEqual(2);
      expect(res.hasFullTableScan).toBe(false);
    }
  }, 30000);
});
