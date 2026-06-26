import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { sessionUserSelect } from "@/consts/session";

/**
 * PATCH endpoint to update the currently logged in user's profile.
 */
export const endpoint = new Elysia()
  .use(auth)
  .patch(
    "/",
    async ({ getAuthenticatedUser, body }) => {
      const user = await getAuthenticatedUser(sessionUserSelect);
      const updated = await user.profile.update(body);
      if (!updated) return "No changes";
      return user.toJSON();
    },
    {
      body: t.Object({
        displayname: t.Optional(t.String()),
        bio: t.Optional(t.String()),
        accentColor: t.Optional(t.String()),
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
