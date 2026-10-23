import { sql } from "../src/db";
import betterConsole, { Card, cs, s, tsflag, rgb } from "ts-better-console";

async function inspectDb() {
  const card = (title: string, lines: string[], color = rgb(90, 103, 216)) => {
    new Card(lines.join("\n"), undefined, {
      title: { content: title },
      border: { symbols: { style: "round" }, style: { color } },
    })
      .render()
      .split("\n")
      .forEach((line) => betterConsole.log(line));
  };

  try {
    // 1. Connection & Engine Info
    const [conn] = await sql<any[]>`
      SELECT 
        DATABASE() as db, 
        USER() as user, 
        @@version as version, 
        @@hostname as host,
        VARIABLE_VALUE as uptime
      FROM information_schema.GLOBAL_STATUS 
      WHERE VARIABLE_NAME = 'UPTIME'
    `.catch(async () => {
      const [basic] = await sql<any[]>`SELECT DATABASE() as db, USER() as user, @@version as version, @@hostname as host`;
      return [{ ...basic, uptime: "N/A" }];
    });

    const [tz] = await sql<any[]>`
      SELECT 
        @@global.time_zone as global_tz, 
        @@session.time_zone as session_tz, 
        NOW() as db_now, 
        UTC_TIMESTAMP() as db_utc_now
    `;

    const hostNow = new Date();
    const dbNow = new Date(tz?.db_now || Date.now());
    const driftMs = Math.abs(hostNow.getTime() - dbNow.getTime());

    card(
      "MariaDB Engine & Timezone State",
      [
        `• Database   : ${s(conn?.db || "unknown", { color: "cyan" })}`,
        `• Connected  : ${s(conn?.user || "unknown", { color: "green" })} on ${conn?.host || "localhost"}`,
        `• Version    : ${conn?.version || "unknown"}`,
        `• Uptime     : ${conn?.uptime ? `${Math.floor(Number(conn.uptime) / 3600)}h ${Math.floor((Number(conn.uptime) % 3600) / 60)}m` : "N/A"}`,
        `• Global TZ  : ${tz?.global_tz} | Session TZ: ${tz?.session_tz}`,
        `• DB Clock   : ${dbNow.toISOString()} (Drift vs Host: ${driftMs}ms)`,
      ],
      rgb(139, 92, 246),
    );

    // 2. Galera Cluster State (if active)
    const galeraStatus = await sql<any[]>`
      SHOW STATUS WHERE Variable_name IN ('wsrep_cluster_status', 'wsrep_cluster_size', 'wsrep_ready', 'wsrep_connected')
    `.catch(() => []);

    if (galeraStatus.length > 0) {
      const gMap = Object.fromEntries(galeraStatus.map((r: any) => [r.Variable_name, r.Value]));
      if (gMap.wsrep_connected === "ON") {
        card(
          "Galera Cluster Status",
          [
            `• Cluster Status : ${s(gMap.wsrep_cluster_status, { color: "green" })}`,
            `• Cluster Size   : ${s(gMap.wsrep_cluster_size, { color: "cyan" })} nodes`,
            `• WSREP Ready    : ${gMap.wsrep_ready === "ON" ? s("YES", { color: "green" }) : s("NO", { color: "red" })}`,
          ],
          rgb(16, 185, 129),
        );
      }
    }

    // 3. Goose Migrations State
    const migrations = await sql<any[]>`
      SELECT version_id, is_applied, tstamp 
      FROM goose_db_version 
      ORDER BY id DESC 
      LIMIT 5
    `.catch(() => []);

    if (migrations.length > 0) {
      const lines = migrations.map(
        (m: any) => `• v${m.version_id} : ${m.is_applied ? s("APPLIED", { color: "green" }) : s("PENDING", { color: "yellow" })} (${m.tstamp})`
      );
      card("Goose Schema Migrations (Latest 5)", lines, rgb(59, 130, 246));
    }

    // 4. Tables & Row Counts Inventory
    const tables = [
      "User",
      "Session",
      "SessionUsage",
      "Organization",
      "OrganizationMember",
      "Streamer",
      "Integration",
      "TransactionLog",
      "WebhookLog",
      "AlertboxEvent",
      "AlertboxSetting",
      "Widget",
    ];

    const tableCounts: string[] = [];
    for (const t of tables) {
      try {
        const [res] = await sql.unsafe(`SELECT COUNT(*) as cnt FROM \`${t}\``);
        tableCounts.push(`• ${t.padEnd(20)} : ${s(String(res.cnt), { color: res.cnt > 0 ? "green" : "gray" })} rows`);
      } catch {
        tableCounts.push(`• ${t.padEnd(20)} : ${s("TABLE MISSING", { color: "red" })}`);
      }
    }
    card("Database Table Inventory", tableCounts, rgb(245, 158, 11));

    // 5. Active & Recent Sessions State
    const sessions = await sql<any[]>`
      SELECT 
        s.id, 
        s.userId, 
        s.token, 
        s.ipAddress, 
        s.expiresAt, 
        s.disabledAt, 
        s.createdAt,
        u.email,
        u.name,
        (s.expiresAt <= NOW()) as is_expired
      FROM Session s
      LEFT JOIN User u ON u.id = s.userId
      ORDER BY s.id DESC 
      LIMIT 5
    `.catch(() => []);

    if (sessions.length > 0) {
      const sessionLines: string[] = [];
      for (const sRow of sessions) {
        const tokenPreview = `${sRow.token.slice(0, 10)}...${sRow.token.slice(-10)}`;
        const status = sRow.disabledAt
          ? s("DISABLED", { color: "red" })
          : sRow.is_expired
          ? s("EXPIRED", { color: "yellow" })
          : s("ACTIVE", { color: "green" });
        sessionLines.push(
          `• Session #${sRow.id} (User #${sRow.userId} ${sRow.name || sRow.email || "Unknown"}) [${status}]\n` +
          `    Token: ${tokenPreview} | IP: ${sRow.ipAddress}\n` +
          `    Created: ${sRow.createdAt} | Expires: ${sRow.expiresAt}`
        );
      }
      card("Latest Sessions Diagnostic", sessionLines, rgb(236, 72, 153));
    }

    // 6. Latest Users
    const users = await sql<any[]>`
      SELECT id, email, name, type, disabledAt, deletedAt, createdAt 
      FROM User 
      ORDER BY id DESC 
      LIMIT 5
    `.catch(() => []);

    if (users.length > 0) {
      const userLines = users.map((u: any) => {
        const status = u.deletedAt
          ? s("DELETED", { color: "red" })
          : u.disabledAt
          ? s("DISABLED", { color: "yellow" })
          : s("ACTIVE", { color: "green" });
        return `• User #${u.id} (${s(u.email || u.name, { color: "cyan" })}) [${u.type}] - ${status}`;
      });
      card("Latest Users", userLines, rgb(20, 184, 166));
    }

  } catch (err) {
    betterConsole.error(tsflag("error", true, "Database Inspection Failed:", err));
  } finally {
    await sql.close();
  }
}

inspectDb();
