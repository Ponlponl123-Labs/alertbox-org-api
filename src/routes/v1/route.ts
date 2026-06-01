import Elysia from "elysia";
import AuthRouter from "./auth";
import MeRouter from "./me";
import ProfileRouter from "./profile";

export const router = new Elysia({ prefix: "v1" })
  .use(AuthRouter)
  .use(MeRouter)
  .use(ProfileRouter);

export default router;
