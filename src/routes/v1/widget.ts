import Elysia, { t } from "elysia";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { getBunServer } from "@/core/bun-server";
import betterConsole, { tsflag, s } from "ts-better-console";

const ALERTS_PREFIX = "alertbox-org:alerts:";
const LOGS_PREFIX = "alertbox-org:streamlabs-relay-logs:";
const TOKEN_CACHE_TTL_SEC = 300;

export const subRedis = redis.redis.duplicate();

export interface CachedWidgetSettings {
  widgetId: string;
  type: string;
  alertbox: any;
}

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

/**
 * Resolve widget ID and full Alertbox settings with Redis caching.
 */
export async function resolveWidgetWithSettings(token: string): Promise<CachedWidgetSettings | null> {
  const cacheKey = `widget:settings:token:${token}`;
  const cached = await redis.redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch {
      // ignore parse error and fallback to DB
    }
  }

  const widget = await prisma.client.widget.findFirst({
    where: { token, deletedAt: null },
    include: {
      alertbox: {
        include: {
          events: true,
        },
      },
    },
  });

  if (!widget) return null;

  const result: CachedWidgetSettings = {
    widgetId: widget.id,
    type: widget.type,
    alertbox: widget.alertbox,
  };

  await redis.redis.setex(cacheKey, TOKEN_CACHE_TTL_SEC, JSON.stringify(result));
  await redis.redis.setex(`widget:token:${token}`, TOKEN_CACHE_TTL_SEC, widget.id);

  return result;
}

/**
 * Broadcast reactive settings updates to all connected widget overlays and invalidate cache.
 */
export async function broadcastWidgetSettingsUpdate(
  widgetId: string,
  alertboxSettings: any,
): Promise<void> {
  const payload = {
    type: "settings:update",
    widgetId,
    updatedAt: Date.now(),
    settings: alertboxSettings,
  };

  // Find token to invalidate token-based cache
  const widget = await prisma.client.widget.findUnique({
    where: { id: widgetId },
    select: { token: true },
  });

  if (widget?.token) {
    await redis.redis.del(`widget:settings:token:${widget.token}`);
  }

  // Publish to Redis channel so all instances broadcast to connected WebSockets
  await redis.redis.publish(`${ALERTS_PREFIX}${widgetId}`, JSON.stringify(payload));
}

export const widgetRouter = new Elysia()
  .get(
    "/widget/:token/settings",
    async ({ params: { token }, set }) => {
      const widgetData = await resolveWidgetWithSettings(token);
      if (!widgetData) {
        set.status = 401;
        return { error: "Unauthorized or invalid widget token" };
      }
      return widgetData;
    },
    {
      params: t.Object({
        token: t.String(),
      }),
    },
  )
  .get(
    "/widget/:token",
    async ({ params: { token }, set }) => {
      const widgetData = await resolveWidgetWithSettings(token);
      if (!widgetData) {
        set.status = 401;
        return { error: "Unauthorized or invalid widget token" };
      }
      return widgetData;
    },
    {
      params: t.Object({
        token: t.String(),
      }),
    },
  )
  .ws("/widget/:token", {
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

        const widgetData = await resolveWidgetWithSettings(token);
        if (!widgetData) {
          ws.send(JSON.stringify({ type: "error", message: "Unauthorized token" }));
          ws.close();
          return;
        }

        ws.subscribe(`widget:${widgetData.widgetId}`);
        ws.send(
          JSON.stringify({
            type: "settings:init",
            widgetId: widgetData.widgetId,
            settings: widgetData.alertbox,
          }),
        );
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

export default widgetRouter;
