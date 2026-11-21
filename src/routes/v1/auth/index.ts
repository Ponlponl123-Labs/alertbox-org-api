import Elysia from "elysia";
import { endpoint as DiscordAuthEndpoint } from "./discord";
import { endpoint as LogoutEndpoint } from "./logout";
import { endpoint as WsTicketEndpoint } from "./ws-ticket";

/**
 * Orchestrator router for version 1 authentication endpoints.
 */
export const router = new Elysia({ prefix: "auth" })
  .use(DiscordAuthEndpoint)
  .use(LogoutEndpoint)
  .use(WsTicketEndpoint);

export default router;
