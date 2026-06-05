import Elysia, { t } from "elysia";
import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import { sessionUserSelect } from "@/consts/session";
import { ip } from "elysia-ip";

/**
 * PATCH endpoint to update the currently logged in user's profile.
 */
export const endpoint = new Elysia()
  .use(ip())
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
        socialDiscord: t.Optional(t.String()),
        socialFacebook: t.Optional(t.String()),
        socialReddit: t.Optional(t.String()),
        socialTwitch: t.Optional(t.String()),
        socialTwitter: t.Optional(t.String()),
        socialYoutube: t.Optional(t.String()),
        avatar: t.Optional(t.File()),
        banner: t.Optional(t.File()),
      }),
    },
  );

export default endpoint;
