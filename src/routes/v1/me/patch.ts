import Elysia, { t } from "elysia";
import { orgContext } from "@/core/org";
import { sessionUserSelect } from "@/consts/session";
import { Moderation } from "@/classes/moderation";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { Me } from "@/classes/me";
import { processAvatar } from "@/utils/image";
import { saveProfileImage, deleteProfileImage } from "@/utils/storage";
import { nanoid } from "nanoid";

/**
 * PATCH endpoint to update the currently logged in user's account name and avatar.
 */
export const endpoint = new Elysia()
  .use(orgContext)
  .patch(
    "/",
    async ({ getAuthenticatedUser, body, set }) => {
      const user = await getAuthenticatedUser(sessionUserSelect);

      const nameInput = (body as any).name || (body as any).userName || (body as any).displayName || body.displayname;
      if (nameInput) {
        const check = await Moderation.moderateText(nameInput);
        if (check.flagged) {
          set.status = "Unavailable For Legal Reasons";
          return "Name contains inappropriate content";
        }
      }

      let avatarUpdated = false;
      if (body.avatar) {
        const buf = Buffer.from(await body.avatar.arrayBuffer());
        const check = await Moderation.moderateImage(buf);
        if (check.flagged) {
          set.status = "Unavailable For Legal Reasons";
          return "Avatar contains inappropriate or NSFW content";
        }
        try {
          const processed = await processAvatar(buf);
          const { url } = await saveProfileImage(String(user.data.id), "avatar", nanoid(), processed.buffer);
          if (user.data.avatar) {
            await deleteProfileImage(user.data.avatar).catch(() => {});
          }
          await prisma.client.user.update({
            where: { id: user.data.id },
            data: { avatar: url },
          });
          user.data.avatar = url;
          avatarUpdated = true;
        } catch {}
      }

      let nameUpdated = false;
      if (nameInput) {
        const userName = nameInput.trim().slice(0, 64);
        await prisma.client.user.update({
          where: { id: user.data.id },
          data: { name: userName },
        });
        user.data.name = userName;
        nameUpdated = true;
      }

      if (!nameUpdated && !avatarUpdated) return "No changes";

      await redis.redis.del(`user:${String(user.data.id)}:info`);
      const freshUser = await new Me({ cache: false }).load(user.data.id, sessionUserSelect);
      return freshUser ? freshUser.toJSON() : user.toJSON();
    },
    {
      detail: {
        tags: ["User Account"],
        summary: "Update user account profile",
        description:
          "Updates user account name and avatar. Accepts `multipart/form-data` or `application/json`.",
      },
      body: t.Object(
        {
          name: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
          userName: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
          displayName: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
          displayname: t.Optional(t.String({ minLength: 1, maxLength: 64 })),
          avatar: t.Optional(
            t.File({
              maxSize: "5m",
              type: ["image/png", "image/jpeg", "image/webp"],
              description: "Avatar image file (PNG, JPEG, WebP, max 5MB).",
            }),
          ),
        },
      ),
      response: {
        200: t.Any({
          description: "Updated user profile object or 'No changes' status.",
        }),
        451: t.String({
          description: "Content moderation safety check rejected input (NSFW, hate speech, violence).",
        }),
      },
    },
  );

export default endpoint;
