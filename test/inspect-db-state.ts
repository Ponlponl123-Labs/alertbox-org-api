import { sql } from "../src/db";

async function main() {
  console.log("=== DB CONNECTION INFO ===");
  try {
    const dbName = await sql`SELECT DATABASE() as db, USER() as user, @@version as version`;
    console.log("Connected to:", dbName);

    const tz = await sql`SELECT @@global.time_zone as global_tz, @@session.time_zone as session_tz, NOW() as now, UTC_TIMESTAMP() as utc_now`;
    console.log("Timezone info:", tz);

    const tables = await sql`SHOW TABLES`;
    console.log("Tables:", tables.map((t: any) => Object.values(t)[0]));

    const goose = await sql`SELECT * FROM _goose_db_version ORDER BY id DESC`.catch((e: any) => e.message);
    console.log("Goose Version:", goose);

    async function getSessionStatus(connection: typeof sql): Promise<Record<string, number>> {
      const rows = await connection.unsafe(
        "SHOW SESSION STATUS WHERE Variable_name IN ('Handler_read_rnd_next', 'Handler_read_first', 'Handler_read_key', 'Handler_read_next', 'Handler_read_prev', 'Innodb_buffer_pool_read_requests', 'Innodb_buffer_pool_reads')"
      );
      const map: Record<string, number> = {};
      for (const r of rows) {
        map[r.Variable_name] = parseInt(r.Value, 10) || 0;
      }
      return map;
    }

    const users = await sql`SELECT id, email, name, disabledAt, deletedAt, type FROM User ORDER BY id DESC LIMIT 5`.catch((e: any) => e.message);
    console.log("Latest Users:", users);

    const sessions = await sql`SELECT id, userId, token, ipAddress, expiresAt, disabledAt, createdAt FROM Session ORDER BY id DESC LIMIT 5`.catch((e: any) => e.message);
    console.log("Latest Sessions:", sessions);

    const members = await sql`SELECT id, orgId, userId, role, permissions, isDeleted FROM OrganizationMember ORDER BY id DESC LIMIT 5`.catch((e: any) => e.message);
    console.log("Latest Members:", members);

    const orgs = await sql`SELECT id, name, slug, ownerId, createBy, type FROM Organization ORDER BY id DESC LIMIT 5`.catch((e: any) => e.message);
    console.log("Latest Orgs:", orgs);

    const streamers = await sql`SELECT id, orgId, name, displayName, uri, deletedAt FROM Streamer ORDER BY id DESC LIMIT 5`.catch((e: any) => e.message);
    console.log("Latest Streamers:", streamers);

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await sql.close();
  }
}

main();
