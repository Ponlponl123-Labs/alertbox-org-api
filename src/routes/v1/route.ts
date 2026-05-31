import Elysia from "elysia";
import AuthRouter from "./auth";
import MeRouter from "./me";

export const router = new Elysia({ prefix: "v1" })
  .use(AuthRouter)
  .use(MeRouter);

export default router;
