import Elysia from "elysia";
import { endpoint as GetByUriEndpoint } from "./get-by-uri";
import { endpoint as GetDetailsEndpoint } from "./get-details";

/**
 * Orchestrator router for version 1 public profile endpoints.
 */
export const router = new Elysia({ prefix: "profile" })
  .use(GetByUriEndpoint)
  .use(GetDetailsEndpoint);

export default router;
