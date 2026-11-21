import Elysia from "elysia";
import { connectEndpoint } from "./connect";

export const kofiEndpoint = new Elysia().use(connectEndpoint);
export default kofiEndpoint;
