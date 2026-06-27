import Elysia from "elysia";
import { endpoint as BmacEndpoint } from "./bmac";
import { endpoint as KofiEndpoint } from "./kofi";

export const router = new Elysia({ prefix: "webhook" })
  .use(BmacEndpoint)
  .use(KofiEndpoint);

export default router;
