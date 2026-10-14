import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";
import { endpoint as PresetsEndpoint } from "./presets/index";

export const endpoint = new Elysia()
  .use(GetEndpoint)
  .use(PresetsEndpoint);

export default endpoint;
