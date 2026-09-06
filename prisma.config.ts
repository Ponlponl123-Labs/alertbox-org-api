import { defineConfig } from "prisma/config";
import betterConsole, { s, tsflag } from "ts-better-console";
import { migrationDbConfig } from "./src/config/env";

betterConsole.log(
  tsflag(
    "info",
    true,
    s(`Prisma CLI DB User: ${migrationDbConfig.user}`, { color: "cyan", styles: ["bold"] }),
  ),
);

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationDbConfig.url,
    ...(migrationDbConfig.shadowUrl ? { shadowDatabaseUrl: migrationDbConfig.shadowUrl } : {}),
  },
});
