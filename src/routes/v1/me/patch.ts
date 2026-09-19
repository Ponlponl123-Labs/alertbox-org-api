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
      detail: {
        tags: ["User Account"],
        summary: "Update user profile and appearance",
        description:
          "Updates profile details including display name, bio, HEX accent color, social handles, and optional avatar / banner image uploads. Accepts `multipart/form-data` when uploading files or `application/json` for text updates.",
      },
      body: t.Object(
        {
          displayname: t.Optional(
            t.String({
              description: "Public creator display name.",
              examples: ["Ponlponl"],
            }),
          ),
          bio: t.Optional(
            t.String({
              description: "Short bio or tagline displayed on tipping pages.",
              examples: ["Fullstack dev & open source creator."],
            }),
          ),
          accentColor: t.Optional(
            t.String({
              description: "Hex color code for theme highlights (with or without #).",
              examples: ["#8B5CF6"],
            }),
          ),
          socialDiscord: t.Optional(
            t.String({
              description: "Discord username or invite link.",
              examples: ["https://discord.gg/alertbox"],
            }),
          ),
          socialFacebook: t.Optional(
            t.String({
              description: "Facebook profile or page URL.",
              examples: ["https://facebook.com/creator"],
            }),
          ),
          socialReddit: t.Optional(
            t.String({
              description: "Reddit username or profile link.",
              examples: ["u/creator"],
            }),
          ),
          socialTwitch: t.Optional(
            t.String({
              description: "Twitch channel name or link.",
              examples: ["https://twitch.tv/creator"],
            }),
          ),
          socialTwitter: t.Optional(
            t.String({
              description: "X / Twitter handle or URL.",
              examples: ["@creator"],
            }),
          ),
          socialYoutube: t.Optional(
            t.String({
              description: "YouTube channel URL or handle.",
              examples: ["@creator"],
            }),
          ),
          avatar: t.Optional(
            t.File({
              description: "Avatar image file (PNG, JPEG, WebP, max 5MB).",
            }),
          ),
          banner: t.Optional(
            t.File({
              description: "Banner cover image file (PNG, JPEG, WebP, max 10MB).",
            }),
          ),
        },
        {
          description: "Profile fields to update.",
          examples: [
            {
              displayname: "Ponlponl",
              bio: "Fullstack dev & open source creator.",
              accentColor: "#8B5CF6",
              socialTwitter: "@ponlponl123",
              socialDiscord: "https://discord.gg/alertbox",
            },
          ],
        },
      ),
      response: {
        200: t.Any({
          description: "Updated user profile object or 'No changes' status.",
        }),
      },
    },
  );

export default endpoint;
