import Elysia from "elysia";
import { endpoint as FetchEndpoint } from "./fetch";
import { endpoint as PresetsEndpoint } from "./presets/index";

export const endpoint = new Elysia()
  .use(FetchEndpoint)
  .use(PresetsEndpoint);

export default endpoint;
