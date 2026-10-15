import Elysia from "elysia";
import { endpoint as ActivityEndpoint } from "./activity";

export const endpoint = new Elysia().use(ActivityEndpoint);

export default endpoint;
