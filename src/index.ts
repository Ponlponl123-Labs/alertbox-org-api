import betterConsole, { Card, cs, link, tsflag } from "ts-better-console";

console.log("");
betterConsole.log(
  new Card(" ♡ AlertBox.Org API ", undefined, {
    border: { symbols: { style: "round" } },
  }).render(),
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
import RedisClient from "./core/redis";
import Server from "./core/server";
import PrismaORM from "./core/prisma";

// ==========================
//
// Initialize API Server
//
// ==========================

new Card("· Starting the server...", undefined, {
  border: { symbols: { style: "round" } },
})
  .render()
  .split("\n")
  .map((line) => betterConsole.log(tsflag("info", true, line)));

export const server = new Server();

// ==========================
//
// Initialize Redis Client
//
// ==========================

new Card("· Starting the Redis client...", undefined, {
  border: { symbols: { style: "round" } },
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
  border: { symbols: { style: "round" } },
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
