import Elysia, { t } from "elysia";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { getBunServer } from "@/core/bun-server";
import betterConsole, { tsflag, s } from "ts-better-console";

const ALERTS_PREFIX = "alertbox-org:alerts:";
const LOGS_PREFIX = "alertbox-org:streamlabs-relay-logs:";
const TOKEN_CACHE_TTL_SEC = 300;

export const subRedis = redis.redis.duplicate();

subRedis.on("error", (err: Error) => {
  betterConsole.error(
    tsflag("error", true, s("Redis Subscriber Error:", { color: "red" })),
    err,
  );
});

subRedis
  .connect()
  .then(() => {
    betterConsole.log(
      tsflag(
        "info",
        true,
        s("Redis Subscriber connected successfully", { color: "green" }),
      ),
    );

    subRedis.psubscribe(
      `${ALERTS_PREFIX}*`,
      `${LOGS_PREFIX}*`,
      (err) => {
        if (err) {
          betterConsole.error(
            tsflag(
              "error",
              true,
              s("Failed to psubscribe to Redis channels:", { color: "red" }),
            ),
            err,
          );
        }
      },
    );
  })
  .catch((err: Error) => {
    betterConsole.error(
      tsflag(
        "error",
        true,
        s("Redis Subscriber Connection Failed:", { color: "red" }),
      ),
      err,
    );
  });

subRedis.on("pmessage", (_pattern: string, channel: string, message: string) => {
  const bunServer = getBunServer();
  if (!bunServer) return;

  if (channel.startsWith(ALERTS_PREFIX)) {
    const widgetId = channel.slice(ALERTS_PREFIX.length);
    bunServer.publish(`widget:${widgetId}`, message);
  } else if (channel.startsWith(LOGS_PREFIX)) {
    const userId = channel.slice(LOGS_PREFIX.length);
    bunServer.publish(`streamlabs-relay-logs:${userId}`, message);
  }
});

async function resolveWidgetId(token: string): Promise<string | null> {
  const cacheKey = `widget:token:${token}`;
  const cachedId = await redis.redis.get(cacheKey);
  if (cachedId) return cachedId;

  const widget = await prisma.client.widget.findFirst({
    where: { token, deletedAt: null },
    select: { id: true },
  });

  if (!widget) return null;

  await redis.redis.setex(cacheKey, TOKEN_CACHE_TTL_SEC, widget.id);
  return widget.id;
}

export const widgetSocket = new Elysia().ws("/widget/:token", {
  params: t.Object({
    token: t.String(),
  }),
  async open(ws) {
    try {
      const { token } = ws.data.params;
      if (!token) {
        ws.send(JSON.stringify({ type: "error", message: "Token is required" }));
        ws.close();
        return;
      }

      const widgetId = await resolveWidgetId(token);
      if (!widgetId) {
        ws.send(JSON.stringify({ type: "error", message: "Unauthorized token" }));
        ws.close();
        return;
      }

      ws.subscribe(`widget:${widgetId}`);
      ws.send(JSON.stringify({ type: "connected", widgetId }));
    } catch (err) {
      betterConsole.error(
        tsflag("error", true, s("WebSocket Handshake Error:", { color: "red" })),
        err,
      );
      ws.send(JSON.stringify({ type: "error", message: "Internal Server Error" }));
      ws.close();
    }
  },
  close() {},
});

export default widgetSocket;
