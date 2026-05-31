import { parseArgs } from "node:util";
import betterConsole, {
  Card,
  cs,
  gradient,
  link,
  rgb,
  s,
  tsflag,
} from "ts-better-console";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: "string", short: "p" },
  },
  strict: false,
});

console.log("");
betterConsole.log(
  s(
    gradient("♡ AlertBox.Org API", [
      rgb(255, 105, 180),
      rgb(255, 182, 193),
    ]).replace(/\n/g, " "),
    {
      styles: ["bold"],
    },
  ),
);
betterConsole.log(
  gradient("  Made with ♡  by Ponlponl123 Labs", [
    rgb(255, 155, 230),
    rgb(255, 232, 253),
  ]).replace(/\n/g, " "),
);
betterConsole.log(
  cs([
    "Github Repository:",
    link(
      "github.com/ponlponl123-labs/alertbox-org-api",
      "https://github.com/ponlponl123/alertbox-org-api",
    ),
  ]),
  "\n",
);

import "./config/env";

// @ts-expect-error BigInt.prototype.toJSON is not defined in the type system
BigInt.prototype.toJSON = function () {
  return this.toString();
};

import RedisClient from "./core/redis";
import Server from "./core/server";
import PrismaORM from "./core/prisma";

// ==========================
//
// Initialize API Server
//
// ==========================

new Card("· Starting the Elysia Server...", undefined, {
  border: {
    style: { color: rgb(139, 92, 246) },
    symbols: { style: "round" },
  },
})
  .render()
  .split("\n")
  .map((line) => betterConsole.log(tsflag("info", true, line)));

export const server = new Server(Number(values.port || 3000));

// ==========================
//
// Initialize Redis Client
//
// ==========================

new Card("· Starting the Redis client...", undefined, {
  border: {
    style: { color: rgb(216, 44, 32) },
    symbols: { style: "round" },
  },
})
  .render()
  .split("\n")
  .map((line) => betterConsole.log(tsflag("info", true, line)));

export const redis = new RedisClient();

// ==========================
//
// Initialize Prisma ORM
//
// ==========================

new Card("· Starting the Prisma ORM...", undefined, {
  border: {
    style: { color: rgb(90, 103, 216) },
    symbols: { style: "round" },
  },
})
  .render()
  .split("\n")
  .map((line) => betterConsole.log(tsflag("info", true, line)));

export const prisma = new PrismaORM();

// ==========================
//
// Handle graceful shutdown
//
// ==========================

const exitSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGQUIT"];
const handleExit = (signal: NodeJS.Signals) => {
  betterConsole.log(
    tsflag("info", true, `Received ${signal}, shutting down...`),
  );
  redis.redis.quit().then(() => {
    betterConsole.log(tsflag("info", true, "Redis connection closed."));
  });
  server.app.stop().then(() => {
    betterConsole.log(tsflag("info", true, "Server stopped."));
    process.exit(0);
  });
};

exitSignals.forEach((signal) => {
  process.on(signal, () => handleExit(signal));
});
