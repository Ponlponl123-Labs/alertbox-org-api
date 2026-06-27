import Elysia from "elysia";
import AuthRouter from "./auth";
import MeRouter from "./me";
import ProfileRouter from "./profile";
import WebhookRouter from "./webhook";
import WidgetRouter from "./widget";

export const router = new Elysia({ prefix: "v1" })
  .use(AuthRouter)
  .use(MeRouter)
  .use(ProfileRouter)
  .use(WebhookRouter)
  .use(WidgetRouter);

export default router;
