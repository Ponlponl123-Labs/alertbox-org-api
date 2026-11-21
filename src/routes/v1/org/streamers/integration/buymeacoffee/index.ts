import Elysia from "elysia";
import { connectEndpoint } from "./connect";

export const bmacEndpoint = new Elysia().use(connectEndpoint);
export default bmacEndpoint;
