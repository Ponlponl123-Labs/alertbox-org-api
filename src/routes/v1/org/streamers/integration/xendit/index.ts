import Elysia from "elysia";
import { connectEndpoint } from "./connect";

export const xenditEndpoint = new Elysia().use(connectEndpoint);
export default xenditEndpoint;
