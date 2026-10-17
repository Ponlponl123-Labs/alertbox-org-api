import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as PostEndpoint } from "./post";
import { endpoint as PatchEndpoint } from "./patch";
import { endpoint as DeleteEndpoint } from "./delete";
import { endpoint as ConnectionsEndpoint } from "./connections/index";
import { endpoint as AuditEndpoint } from "./audit/index";
import { endpoint as TransactionsEndpoint } from "./transactions/index";
import { endpoint as TinyEndpoint } from "./tiny";

export const endpoint = new Elysia()
  .use(GetEndpoint)
  .use(PostEndpoint)
  .use(PatchEndpoint)
  .use(DeleteEndpoint)
  .use(ConnectionsEndpoint)
  .use(AuditEndpoint)
  .use(TransactionsEndpoint)
  .use(TinyEndpoint);

export default endpoint;
