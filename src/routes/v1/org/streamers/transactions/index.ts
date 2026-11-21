import Elysia from "elysia";
import { endpoint as ListEndpoint } from "./list";
import { endpoint as TestEndpoint } from "./test";
import { endpoint as RemoveEndpoint } from "./remove";
import { endpoint as ResendEndpoint } from "./resend";
import { endpoint as WsEndpoint } from "./ws";

export const endpoint = new Elysia()
  .use(ListEndpoint)
  .use(TestEndpoint)
  .use(RemoveEndpoint)
  .use(ResendEndpoint)
  .use(WsEndpoint);

export default endpoint;
