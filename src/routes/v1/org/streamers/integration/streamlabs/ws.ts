import Elysia, { t } from "elysia";
import { extractRequestToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { isAllowedOrigin } from "@/utils/security";
import { authorizeStreamer } from "@/core/org";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { integrationParamsSchema } from "../common";
import { consumeWsTicket } from "@/routes/v1/auth/ws-ticket";

export const wsEndpoint = new Elysia()
  .use(ip({ headersFirst: true }))
  .ws("/streamlabs/ws", {
    params: integrationParamsSchema,
    detail: {
      tags: ["Streamlabs Relay"],
      summary: "Streamlabs live relay log stream",
      description: "Subscribes to live Streamlabs relay events for the streamer channel.",
    },
    query: t.Object({
      ticket: t.Optional(t.String({ description: "Single-use 15s WebSocket ticket" })),
      token: t.Optional(t.String({ description: "Session bearer token" })),
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
            requiredOrgPerm: OrgPerm.INTEGRATION_VIEW,
            requiredStreamerPerm: StreamerPerm.STREAMER_VIEW,
            actionDescription: "view Streamlabs live logs",
          },
          dummySet,
        );

        if (typeof authRes === "string") {
          ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN", message: authRes }));
          ws.close(4003, authRes);
          return;
        }

        const { orgId, streamerId } = authRes;
        const channel = `streamlabs-relay-logs:${String(streamerId)}`;
        const altChannel = `alertbox-org:streamlabs-relay-logs:${String(streamerId)}`;

        ws.subscribe(channel);
        ws.subscribe(altChannel);
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
      } catch {}
    },
    close() {},
  });

export default wsEndpoint;
