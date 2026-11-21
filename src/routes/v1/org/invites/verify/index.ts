import Elysia from "elysia";
import { endpoint as VerifyEndpoint } from "./verify";

export const endpoint = new Elysia({ prefix: "/verify" })
  .use(VerifyEndpoint);

export default endpoint;
