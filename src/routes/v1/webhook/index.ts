import Elysia from "elysia";
import { endpoint as BmacEndpoint } from "./bmac";

export const router = new Elysia({ prefix: "webhook" }).use(BmacEndpoint);

export default router;
