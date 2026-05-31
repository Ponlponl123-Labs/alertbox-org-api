import Elysia from "elysia";
import v1Router from "./v1/route";

export const availableVersions = ["v1"];

export const router = new Elysia().use(v1Router);

export default router;
