import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as PatchEndpoint } from "./patch";
import { endpoint as DeleteEndpoint } from "./delete";

export const endpoint = new Elysia()
  .use(GetEndpoint)
  .use(PatchEndpoint)
  .use(DeleteEndpoint);

export default endpoint;
