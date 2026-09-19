import Elysia from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { isAllowedOrigin } from "@/utils/security";

export const endpoint = new Elysia()
  .use(ip({ headersFirst: true }))
  .ws("/ws", {
    maxPayloadLength: 16 * 1024,
    idleTimeout: 60,
    async open(ws) {
      try {
        const origin = (ws.data.headers as Record<string, string | undefined>)["origin"];
        if (origin && !isAllowedOrigin(origin)) {
          ws.send(JSON.stringify({ type: "error", message: "Forbidden origin" }));
          ws.close();
          return;
        }

        const authHeader = (ws.data.headers as Record<string, string | undefined>)["authorization"];
        const token = ws.data.query.token || (authHeader ? isBearerToken(authHeader) : null);
        if (!token) {
          ws.send(JSON.stringify({ type: "error", message: "Token is required" }));
          ws.close();
          return;
        }

        const auth = typeof token === "string" && !token.startsWith("Bearer ")
          ? isBearerToken("Bearer " + token)
          : token;
        if (!auth) {
          ws.send(JSON.stringify({ type: "error", message: "Invalid token format" }));
          ws.close();
          return;
        }

        const user = await new Me({ cache: true }).use(auth, ws.data.ip, { id: true });
        if (!user || !user.data) {
          ws.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
          ws.close();
          return;
        }

        // Subscribe to the user's logs channel
        ws.subscribe("streamlabs-relay-logs:" + user.data.id);

        // Acknowledge connection
        ws.send(JSON.stringify({ type: "connected", userId: user.data.id }));
      } catch (err) {
        ws.send(JSON.stringify({ type: "error", message: "Internal Server Error" }));
        ws.close();
      }
    },
  });

export default endpoint;
