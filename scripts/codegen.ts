import { dbConfig } from "@/config/env";

const url = dbConfig.url;
const res = Bun.spawnSync([
  "bunx",
  "kysely-codegen",
  "--dialect",
  "mysql",
  "--url",
  url,
  "--out-file",
  "src/db/types.d.ts",
], {
  stdio: ["inherit", "inherit", "inherit"],
});

process.exit(res.exitCode);
