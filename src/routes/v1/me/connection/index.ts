import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as PostEndpoint } from "./post";
import { endpoint as DeleteEndpoint } from "./delete";
import { endpoint as IntegrationEndpoint } from "./integration";

/**
 * Orchestrator router for version 1 connection/integration endpoints under /me/connection.
 */
export const endpoint = new Elysia({ prefix: "/connection" })
  .use(GetEndpoint)
  .use(PostEndpoint)
  .use(DeleteEndpoint)
  .use(IntegrationEndpoint);

export default endpoint;
