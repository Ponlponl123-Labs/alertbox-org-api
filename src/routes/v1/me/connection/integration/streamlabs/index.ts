import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as PostEndpoint } from "./post";
import { endpoint as DeleteEndpoint } from "./delete";

export const endpoint = new Elysia({ prefix: "/streamlabs" })
  .use(GetEndpoint)
  .use(PostEndpoint)
  .use(DeleteEndpoint);

export default endpoint;
