import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as PostEndpoint } from "./post";
import { endpoint as DeleteEndpoint } from "./delete";
import { endpoint as PatchEndpoint } from "./patch";
import { endpoint as WsEndpoint } from "./ws";

export const endpoint = new Elysia({ prefix: "/streamlabs" })
  .use(GetEndpoint)
  .use(PostEndpoint)
  .use(DeleteEndpoint)
  .use(PatchEndpoint)
  .use(WsEndpoint);

export default endpoint;
