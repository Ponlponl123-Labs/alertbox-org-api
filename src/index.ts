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

import "./config/env";
import { redis } from "./core/redis";
import { prisma } from "./core/prisma";
import Server from "./core/server";

// @ts-expect-error BigInt.prototype.toJSON is not defined in the type system
BigInt.prototype.toJSON = function (): string {
  return this.toString();
};

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    port: { type: "string", short: "p" },
  },
  strict: false,
});

const printBanner = (): void => {
  betterConsole.log("");
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
};

printBanner();

new Card("· Starting the Elysia Server...", undefined, {
  border: {
    style: { color: rgb(139, 92, 246) },
    symbols: { style: "round" },
  },
})
  .render()
  .split("\n")
  .forEach((line) => betterConsole.log(tsflag("info", true, line)));

export const server = new Server(Number(values.port || 3000));

export { redis, prisma };

const exitSignals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGQUIT"];

const handleExit = async (signal: NodeJS.Signals): Promise<void> => {
  betterConsole.log(
    tsflag("info", true, `Received ${signal}, shutting down...`),
  );

  try {
    if (redis && redis.redis) {
      await redis.redis.quit();
      betterConsole.log(tsflag("info", true, "Redis connection closed."));
    }

    if (prisma && prisma.client) {
      await prisma.client.$disconnect();
      betterConsole.log(
        tsflag("info", true, "Prisma connection disconnected."),
      );
    }

    if (server && server.app) {
      await server.app.stop();
      betterConsole.log(tsflag("info", true, "Server stopped."));
    }
  } catch (error) {
    betterConsole.log(
      tsflag("error", true, "Error occurred during graceful shutdown:", error),
    );
  } finally {
    process.exit(0);
  }
};

exitSignals.forEach((signal) => {
  process.on(signal, () => {
    handleExit(signal).catch((err) => {
      betterConsole.log(
        tsflag("error", true, `Failed during shutdown: ${err}`),
      );
      process.exit(1);
    });
  });
});
