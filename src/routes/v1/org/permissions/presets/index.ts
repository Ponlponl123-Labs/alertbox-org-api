import Elysia from "elysia";
import { endpoint as ListEndpoint } from "./list";
import { endpoint as CreateEndpoint } from "./create";
import { endpoint as UpdateEndpoint } from "./update";
import { endpoint as RemoveEndpoint } from "./remove";

export const endpoint = new Elysia()
  .use(ListEndpoint)
  .use(CreateEndpoint)
  .use(UpdateEndpoint)
  .use(RemoveEndpoint);

export default endpoint;
