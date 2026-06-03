import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import { endpoint as ConnectionEndpoint } from "./connections";
import { endpoint as DeviceEndpoint } from "./device";
import { endpoint as ProfileEndpoint } from "./profile";
import Elysia, { t } from "elysia";

import { sessionUserSelect } from "@/consts/session";

export const router = new Elysia({ prefix: "me" })
  .use(ConnectionEndpoint)
  .use(DeviceEndpoint)
  .use(ProfileEndpoint)
  .get(
    "/",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me().use(auth, ip, sessionUserSelect);
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      return user.toJSON();
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  )
  .patch(
    "/",
    async ({ headers, set, ip, body }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me().use(auth, ip, sessionUserSelect);
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      const updated = await user.profile.update(body);
      if (!updated) return "No changes";

      return user.toJSON();
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
      body: t.Object({
        displayname: t.Optional(t.String()),
        bio: t.Optional(t.String()),
        social_discord: t.Optional(t.String()),
        social_facebook: t.Optional(t.String()),
        social_reddit: t.Optional(t.String()),
        social_twitchtv: t.Optional(t.String()),
        social_twitter: t.Optional(t.String()),
        social_youtube: t.Optional(t.String()),
        avatar: t.Optional(t.File()),
        banner: t.Optional(t.File()),
      }),
    },
  )
  .delete(
    "/",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me().use(auth, ip, sessionUserSelect);
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      await user.delete();

      return "OK, Goodbye!";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default router;
