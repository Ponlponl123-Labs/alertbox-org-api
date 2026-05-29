import "./config/env";
import betterConsole, { tsflag } from "ts-better-console";
import RedisClient from "./core/redis";
import Server from "./core/server";
import PrismaORM from "./core/prisma";

betterConsole.log(tsflag("info", true, "Starting the server..."));

export const server = new Server();
export const redis = new RedisClient();
export const prisma = new PrismaORM();

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
