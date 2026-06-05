import Elysia from "elysia";
import { endpoint as PostEndpoint } from "./post";
import { endpoint as PatchEndpoint } from "./patch";
import { endpoint as DeleteEndpoint } from "./delete";

/**
 * Orchestrator router for version 1 profile endpoints under /me/profile.
 */
export const endpoint = new Elysia({ prefix: "profile" })
  .use(PostEndpoint)
  .use(PatchEndpoint)
  .use(DeleteEndpoint);

export default endpoint;
