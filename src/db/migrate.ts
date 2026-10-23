import { migrationDbConfig } from "@/config/env";

const action = process.argv[2] || "up";
const cfg = migrationDbConfig;

const getDsn = (): string => {
  const raw = process.env.DATABASE_URL || process.env.MIGRATION_DATABASE_URL || process.env.GOOSE_DBSTRING;
  if (raw) {
    if (!raw.startsWith("mysql://")) return raw;
    const u = new URL(raw);
    return `${decodeURIComponent(u.username)}:${decodeURIComponent(u.password)}@tcp(${u.hostname}:${u.port || 3306})${u.pathname}?parseTime=true`;
  }
  return `${cfg.user}:${cfg.password}@tcp(${cfg.host}:${cfg.port})/${cfg.database}?parseTime=true`;
};

const res = Bun.spawnSync(
  ["goose", "-dir", "migrations", "mysql", getDsn(), action, ...process.argv.slice(3)],
  { stdio: ["inherit", "inherit", "inherit"] }
);

process.exit(res.exitCode);
