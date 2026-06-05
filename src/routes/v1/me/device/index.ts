import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as DeleteEndpoint } from "./delete";

/**
 * Orchestrator router for version 1 device endpoints under /me/device.
 */
export const endpoint = new Elysia({ prefix: "/device" })
  .use(GetEndpoint)
  .use(DeleteEndpoint);

export default endpoint;
