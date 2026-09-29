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
              minLength: 1,
              maxLength: 64,
              description: "Public creator display name.",
              examples: ["Ponlponl123"],
            }),
          ),
          bio: t.Optional(
            t.String({
              maxLength: 1000,
              description: "Short bio or tagline displayed on tipping pages.",
              examples: ["Fullstack dev & open source creator."],
            }),
          ),
          accentColor: t.Optional(
            t.String({
              pattern: "^$|^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
              description: "Hex color code for theme highlights (with or without #).",
              examples: ["#8B5CF6"],
            }),
          ),
          socialDiscord: t.Optional(
            t.String({
              pattern: "^$|^@?[a-zA-Z0-9_.-]{1,64}$",
              maxLength: 64,
              description: "Discord username or invite code.",
              examples: ["alertbox"],
            }),
          ),
          socialFacebook: t.Optional(
            t.String({
              pattern: "^$|^@?[a-zA-Z0-9_.-]{1,64}$",
              maxLength: 64,
              description: "Facebook profile or page handle.",
              examples: ["creator"],
            }),
          ),
          socialReddit: t.Optional(
            t.String({
              pattern: "^$|^(u/)?[a-zA-Z0-9_.-]{1,64}$",
              maxLength: 64,
              description: "Reddit username or profile handle.",
              examples: ["u/creator"],
            }),
          ),
          socialTwitch: t.Optional(
            t.String({
              pattern: "^$|^@?[a-zA-Z0-9_.-]{1,64}$",
              maxLength: 64,
              description: "Twitch channel name.",
              examples: ["creator"],
            }),
          ),
          socialTwitter: t.Optional(
            t.String({
              pattern: "^$|^@?[a-zA-Z0-9_.-]{1,64}$",
              maxLength: 64,
              description: "X / Twitter handle.",
              examples: ["@creator"],
            }),
          ),
          socialYoutube: t.Optional(
            t.String({
              pattern: "^$|^@?[a-zA-Z0-9_.-]{1,64}$",
              maxLength: 64,
              description: "YouTube channel handle.",
              examples: ["@creator"],
            }),
          ),
          avatar: t.Optional(
            t.File({
              maxSize: "5m",
              type: ["image/png", "image/jpeg", "image/webp"],
              description: "Avatar image file (PNG, JPEG, WebP, max 5MB).",
            }),
          ),
          banner: t.Optional(
            t.File({
              maxSize: "10m",
              type: ["image/png", "image/jpeg", "image/webp"],
              description: "Banner cover image file (PNG, JPEG, WebP, max 10MB).",
            }),
          ),
        },
        {
          description: "Profile fields to update.",
          examples: [
            {
              displayname: "Ponlponl123",
              bio: "Fullstack dev & open source creator.",
              accentColor: "#8B5CF6",
              socialTwitter: "@ponlponl123",
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
