import Elysia, { t } from "elysia";
import { extractRequestToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { isAllowedOrigin } from "@/utils/security";
import { authorizeStreamer } from "@/core/org";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { consumeWsTicket } from "@/routes/v1/auth/ws-ticket";

export const endpoint = new Elysia()
  .use(ip({ headersFirst: true }))
  .ws("/:orgId/streamers/:streamerId/transactions/live", {
    detail: {
      tags: ["Streamer Transactions"],
      summary: "Streamer live transactions WebSocket stream",
      description:
        "Subscribes to live incoming streamer donations, test transactions, and status updates via secure WebSocket. Authenticate via ?ticket=<wsTicket>, HttpOnly USRSS cookie, Authorization Bearer header, or legacy ?token=<sessionToken>.",
    },
    params: t.Object({
      orgId: t.String({ description: "Organization ID or slug" }),
      streamerId: t.String({ description: "Streamer ID or username" }),
    }),
    query: t.Object({
      ticket: t.Optional(t.String({ description: "Single-use 15s WebSocket ticket" })),
      token: t.Optional(t.String({ description: "User session token" })),
    }),
    maxPayloadLength: 16 * 1024,
    idleTimeout: 60,
    async open(ws) {
      try {
        const hdrs = ws.data.headers as Record<string, string | undefined>;
        const origin = hdrs["origin"];
        if (origin && !isAllowedOrigin(origin)) {
          ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN_ORIGIN", message: "Forbidden origin" }));
          ws.close(4003, "Forbidden origin");
          return;
        }

        let userId: bigint | null = null;
        const ticketParam = ws.data.query.ticket;
        if (ticketParam) {
          const ticketAuth = await consumeWsTicket(ticketParam);
          if (!ticketAuth) {
            ws.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED", message: "Invalid or expired ticket" }));
            ws.close(4001, "Invalid or expired ticket");
            return;
          }
          userId = ticketAuth.userId;
        } else {
          const headerToken = extractRequestToken(hdrs);
          const token = headerToken || ws.data.query.token || null;
          if (!token) {
            ws.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED", message: "Token is required" }));
            ws.close(4001, "Token required");
            return;
          }
          if (typeof token !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(token)) {
            ws.send(JSON.stringify({ type: "error", code: "INVALID_TOKEN", message: "Invalid token format" }));
            ws.close(4001, "Invalid token format");
            return;
          }

          const user = await new Me({ cache: true }).use(token, ws.data.ip, { id: true });
          if (!user || !user.data) {
            ws.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED", message: "Unauthorized token" }));
            ws.close(4001, "Unauthorized");
            return;
          }
          userId = BigInt(user.data.id);
        }

        const dummySet = { status: 200 } as any;
        const authRes = await authorizeStreamer(
          ws.data.params.orgId,
          ws.data.params.streamerId,
          userId,
          {
            requiredOrgPerm: OrgPerm.TRANSACTION_VIEW,
            requiredStreamerPerm: StreamerPerm.STREAMER_TRANSACTION_VIEW,
            actionDescription: "view live transactions",
          },
          dummySet,
        );

        if (typeof authRes === "string") {
          ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN", message: authRes }));
          ws.close(4003, authRes);
          return;
        }

        const { orgId, streamerId } = authRes;
        const channel = `org:${String(orgId)}:streamer:${String(streamerId)}:transactions`;

        ws.subscribe(channel);
        ws.send(
          JSON.stringify({
            type: "connected",
            orgId: String(orgId),
            streamerId: String(streamerId),
            channel,
            timestamp: new Date().toISOString(),
          }),
        );
      } catch {
        ws.send(JSON.stringify({ type: "error", code: "INTERNAL_ERROR", message: "Handshake failed" }));
        ws.close(1011, "Internal Server Error");
      }
    },
    message(ws, message) {
      try {
        const raw = typeof message === "string" ? message : JSON.stringify(message);
        if (raw === "ping" || raw === `{"type":"ping"}`) {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        }
      } catch {
        // ignore
      }
    },
    close() {},
  });

export default endpoint;
