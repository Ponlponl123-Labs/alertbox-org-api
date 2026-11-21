import Elysia from "elysia";
import { endpoint as CreateEndpoint } from "./create";
import { endpoint as UpdateEndpoint } from "./update";
import { endpoint as RemoveEndpoint } from "./remove";

export const endpoint = new Elysia({ prefix: "profile" })
  .use(CreateEndpoint)
  .use(UpdateEndpoint)
  .use(RemoveEndpoint);

export default endpoint;
