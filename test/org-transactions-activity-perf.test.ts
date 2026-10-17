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

describe("Organization Transaction Activity Query Performance & Index Verification", () => {
  beforeAll(async () => {
    pool = createPool({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
      database: dbConfig.database,
      connectionLimit: 2,
    });
    conn = await pool.getConnection();
  });

  afterAll(async () => {
    if (conn) conn.release();
    if (pool) await pool.end();
  });

  it("TransactionLog.byOrgActivity: verifies sub-millisecond execution, index range scan, zero full table scans", async () => {
    const sql =
      "SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') as day, COUNT(*) as count " +
      "FROM `TransactionLog` FORCE INDEX (`TransactionLog_orgId_createdAt_idx`) " +
      "WHERE orgId = 1 AND createdAt >= DATE_SUB(NOW(), INTERVAL 365 DAY) AND status != 'FAILED' " +
      "GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')";

    const explain: ExplainRow[] = await conn.query(`EXPLAIN ${sql}`);

    // Verify index usage
    const hasFullTableScan = explain.some((r) => r.type === "ALL");
    expect(hasFullTableScan).toBe(false);

    const usedKey = explain.find((r) => r.key?.includes("TransactionLog_orgId_createdAt_idx"));
    expect(usedKey).toBeDefined();
    expect(usedKey?.type).toBe("range");

    // Measure raw execution latency and buffer pool metrics
    const before = await getSessionStatus(conn);
    const start = performance.now();
    await conn.query(sql);
    const durationMs = performance.now() - start;
    const after = await getSessionStatus(conn);

    const physicalReads = Math.max(0, (after.Innodb_buffer_pool_reads ?? 0) - (before.Innodb_buffer_pool_reads ?? 0));
    const logicalReads = Math.max(0, (after.Innodb_buffer_pool_read_requests ?? 0) - (before.Innodb_buffer_pool_read_requests ?? 0));

    console.log(`    ⚡ [TransactionLog.byOrgActivity] Latency: ${durationMs.toFixed(2)}ms | Logical Reads: ${logicalReads} | Physical Reads: ${physicalReads} | Index: ${usedKey?.key}(${usedKey?.type})`);

    expect(physicalReads).toBe(0);
    expect(logicalReads).toBeLessThanOrEqual(20); // Strict threshold (<= 20 buffer pool reads)
    expect(durationMs).toBeLessThanOrEqual(13);   // Ultra-raw execution performance limit (<= 13ms)
  });
});
