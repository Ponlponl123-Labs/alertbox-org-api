import Elysia from "elysia";
import { endpoint as ConnectionEndpoint } from "./connection/index";
import { endpoint as DeviceEndpoint } from "./device/index";
import { endpoint as ProfileEndpoint } from "./profile/index";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as PatchEndpoint } from "./patch";
import { endpoint as DeleteEndpoint } from "./delete";

/**
 * Main orchestrator router for version 1 /me endpoints.
 */
export const router = new Elysia({ prefix: "me" })
  .use(ConnectionEndpoint)
  .use(DeviceEndpoint)
  .use(ProfileEndpoint)
  .use(GetEndpoint)
  .use(PatchEndpoint)
  .use(DeleteEndpoint);

export default router;
