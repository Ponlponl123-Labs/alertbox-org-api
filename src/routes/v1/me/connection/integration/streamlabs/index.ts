import Elysia from "elysia";
import { endpoint as GetEndpoint } from "./get";

export const endpoint = new Elysia({ prefix: "/streamlabs" }).use(GetEndpoint);

export default endpoint;
