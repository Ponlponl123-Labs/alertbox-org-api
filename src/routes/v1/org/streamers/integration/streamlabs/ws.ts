import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { isAllowedOrigin } from "@/utils/security";
import { authorizeStreamer } from "@/core/org";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { integrationParamsSchema } from "../common";

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
      token: t.Optional(t.String({ description: "Session bearer token" })),
    }),
    maxPayloadLength: 16 * 1024,
    idleTimeout: 60,
    async open(ws) {
      try {
        const origin = (ws.data.headers as Record<string, string | undefined>)["origin"];
        if (origin && !isAllowedOrigin(origin)) {
          ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN_ORIGIN", message: "Forbidden origin" }));
          ws.close(1008, "Forbidden origin");
          return;
        }

        const authHeader = (ws.data.headers as Record<string, string | undefined>)["authorization"];
        const rawToken = ws.data.query.token || (authHeader ? isBearerToken(authHeader) : null);
        if (!rawToken) {
          ws.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED", message: "Token is required" }));
          ws.close(1008, "Token required");
          return;
        }

        const token =
          typeof rawToken === "string" && rawToken.startsWith("Bearer ")
            ? isBearerToken(rawToken)
            : rawToken;
        if (!token || typeof token !== "string" || !/^[a-zA-Z0-9_.-]+$/.test(token)) {
          ws.send(JSON.stringify({ type: "error", code: "INVALID_TOKEN", message: "Invalid token format" }));
          ws.close(1008, "Invalid token format");
          return;
        }

        const user = await new Me({ cache: true }).use(token, ws.data.ip, { id: true });
        if (!user || !user.data) {
          ws.send(JSON.stringify({ type: "error", code: "UNAUTHORIZED", message: "Unauthorized token" }));
          ws.close(1008, "Unauthorized");
          return;
        }

        const dummySet = { status: 200 } as any;
        const authRes = await authorizeStreamer(
          ws.data.params.orgId,
          ws.data.params.streamerId,
          user.data.id,
          {
            requiredOrgPerm: OrgPerm.INTEGRATION_VIEW,
            requiredStreamerPerm: StreamerPerm.STREAMER_VIEW,
            actionDescription: "view Streamlabs live logs",
          },
          dummySet,
        );

        if (typeof authRes === "string") {
          ws.send(JSON.stringify({ type: "error", code: "FORBIDDEN", message: authRes }));
          ws.close(1008, authRes);
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
