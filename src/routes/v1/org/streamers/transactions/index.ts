import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as TestEndpoint } from "./test";
import { endpoint as DeleteEndpoint } from "./delete";
import { endpoint as ResendEndpoint } from "./resend";
import { endpoint as WsEndpoint } from "./ws";

export const endpoint = new Elysia()
  .use(GetEndpoint)
  .use(TestEndpoint)
  .use(DeleteEndpoint)
  .use(ResendEndpoint)
  .use(WsEndpoint);

export default endpoint;
