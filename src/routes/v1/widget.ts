import Elysia from "elysia";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { getBunServer } from "@/core/bun-server";
import betterConsole, { tsflag, s } from "ts-better-console";

// Create a dedicated Redis subscriber connection
// We use the same configuration as the main redis client
const subRedis = redis.redis.duplicate();

subRedis.on("error", (err) => {
  betterConsole.error(
    tsflag("error", true, s("Redis Subscriber Error:", { color: "red" })),
    err
  );
});

// Connect to Redis and subscribe to target channel pattern
subRedis.connect().then(() => {
  betterConsole.log(
    tsflag("info", true, s("✓ Redis Subscriber connected successfully!", { color: "green" }))
  );
  
  subRedis.psubscribe("alertbox-org:alerts:*", "alertbox-org:streamlabs-relay-logs:*", (err) => {
    if (err) {
      betterConsole.error(
        tsflag("error", true, s("Failed to psubscribe to Redis channels:", { color: "red" })),
        err
      );
    }
  });
}).catch((err) => {
  betterConsole.error(
    tsflag("error", true, s("Redis Subscriber Connection Failed:", { color: "red" })),
    err
  );
});

/**
 * WebSocket endpoint to safely stream alerts only to target widgets.
 */
export const widgetSocket = new Elysia()
  .ws("/widget/:token", {
    async open(ws) {
      try {
        const token = ws.data.params.token;
        if (!token) {
          ws.send(JSON.stringify({ type: "error", message: "Token is required" }));
          ws.close();
          return;
        }

        // Validate the token and ensure widget is not deleted
        const widget = await prisma.client.widget.findFirst({
          where: {
            token,
            deletedAt: null,
          },
          select: {
            id: true,
          },
        });

        if (!widget) {
          ws.send(JSON.stringify({ type: "error", message: "Unauthorized token" }));
          ws.close();
          return;
        }

        // Subscribe socket client to the globally unique widget ID topic
        ws.subscribe("widget:" + widget.id);

        // Acknowledge connection
        ws.send(JSON.stringify({ type: "connected", widgetId: widget.id }));
      } catch (err) {
        betterConsole.error(
          tsflag("error", true, s("WebSocket Handshake Error:", { color: "red" })),
          err
        );
        ws.send(JSON.stringify({ type: "error", message: "Internal Server Error" }));
        ws.close();
      }
    },

    close(ws) {
      // Elysia automatically handles unsubscribing when WS connection closes
    },
  });

// Listen to incoming pub/sub messages and forward them locally using Elysia's publish topic
subRedis.on("pmessage", (pattern, channel, message) => {
  const alertsPrefix = "alertbox-org:alerts:";
  const logsPrefix = "alertbox-org:streamlabs-relay-logs:";

  if (channel.startsWith(alertsPrefix)) {
    const widgetId = channel.substring(alertsPrefix.length);
    getBunServer()?.publish("widget:" + widgetId, message);
  } else if (channel.startsWith(logsPrefix)) {
    const userId = channel.substring(logsPrefix.length);
    getBunServer()?.publish("streamlabs-relay-logs:" + userId, message);
  }
});

export default widgetSocket;
