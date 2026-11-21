import Elysia from "elysia";
import { endpoint as ListEndpoint } from "./list";
import { endpoint as RevokeEndpoint } from "./revoke";

export const endpoint = new Elysia({ prefix: "/device" })
  .use(ListEndpoint)
  .use(RevokeEndpoint);

export default endpoint;
