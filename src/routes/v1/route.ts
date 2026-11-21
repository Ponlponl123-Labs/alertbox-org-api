import Elysia from "elysia";
import AuthRouter from "./auth";
import MeRouter from "./me";
import ProfileRouter from "./profile";
import WebhookRouter from "./webhook";
import WidgetRouter from "./widget";
import OrgRouter from "./org";
import StreamersRouter from "./streamers";
import InstanceRouter from "./instance";

export const router = new Elysia({ prefix: "v1" })
  .use(AuthRouter)
  .use(MeRouter)
  .use(OrgRouter)
  .use(StreamersRouter)
  .use(ProfileRouter)
  .use(WebhookRouter)
  .use(WidgetRouter)
  .use(InstanceRouter);

export default router;
