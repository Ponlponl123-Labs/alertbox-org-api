import Elysia from "elysia";
import { endpoint as PostEndpoint } from "./post";

export const endpoint = new Elysia({ prefix: "/verify" })
  .use(PostEndpoint);

export default endpoint;
