import Elysia from "elysia";
import { endpoint as ListEndpoint } from "./list";

export const endpoint = new Elysia().use(ListEndpoint);

export default endpoint;
