import Elysia from "elysia";
import { endpoint as AcceptEndpoint } from "./accept";

export const endpoint = new Elysia({ prefix: "/accept" })
  .use(AcceptEndpoint);

export default endpoint;
