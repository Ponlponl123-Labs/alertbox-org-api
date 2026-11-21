import Elysia from "elysia";
import { connectEndpoint } from "./connect";

export const feelfreepayEndpoint = new Elysia().use(connectEndpoint);
export default feelfreepayEndpoint;
