import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as PostEndpoint } from "./post";
import { endpoint as PatchEndpoint } from "./patch";
import { endpoint as DeleteEndpoint } from "./delete";

export const endpoint = new Elysia()
  .use(GetEndpoint)
  .use(PostEndpoint)
  .use(PatchEndpoint)
  .use(DeleteEndpoint);

export default endpoint;
