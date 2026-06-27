import Elysia from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";

export const endpoint = new Elysia()
  .use(ip())
  .ws("/ws", {
    async open(ws) {
      try {
        const token = ws.data.query.token;
        if (!token) {
          ws.send(JSON.stringify({ type: "error", message: "Token is required" }));
          ws.close();
          return;
        }

        const auth = isBearerToken("Bearer " + token);
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
