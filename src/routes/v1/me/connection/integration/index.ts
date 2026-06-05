import Elysia from "elysia";
import { endpoint as StreamlabsEndpoint } from "./streamlabs";

export const endpoint = new Elysia({ prefix: "/integration" }).use(
  StreamlabsEndpoint,
);

export default endpoint;
