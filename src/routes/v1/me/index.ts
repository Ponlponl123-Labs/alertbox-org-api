import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import {
  endpoint as ConnectionEndpoint,
  supported_providers,
} from "./connections";
import { endpoint as DeviceEndpoint } from "./device";
import { endpoint as ProfileEndpoint } from "./profile";
import { processAvatar, processBanner } from "@/utils/image";
import { saveProfileImage, deleteProfileImage } from "@/utils/storage";
import { nanoid } from "nanoid";
import Elysia, { t } from "elysia";
import { prisma, redis } from "@/index";
import { day } from "@/consts/time";

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
      return user.data;
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

      const data: any = {};
      if (body.displayname) {
        data.displayname = String(body.displayname).trim().slice(0, 64);
      }
      if (body.bio !== undefined) {
        data.bio = body.bio ? String(body.bio).trim().slice(0, 1000) : null;
      }

      if (body.social_discord !== undefined) {
        data.social_discord = body.social_discord
          ? String(body.social_discord).trim().slice(0, 512)
          : null;
      }
      if (body.social_facebook !== undefined) {
        data.social_facebook = body.social_facebook
          ? String(body.social_facebook).trim().slice(0, 512)
          : null;
      }
      if (body.social_reddit !== undefined) {
        data.social_reddit = body.social_reddit
          ? String(body.social_reddit).trim().slice(0, 512)
          : null;
      }
      if (body.social_twitchtv !== undefined) {
        data.social_twitchtv = body.social_twitchtv
          ? String(body.social_twitchtv).trim().slice(0, 512)
          : null;
      }
      if (body.social_twitter !== undefined) {
        data.social_twitter = body.social_twitter
          ? String(body.social_twitter).trim().slice(0, 512)
          : null;
      }
      if (body.social_youtube !== undefined) {
        data.social_youtube = body.social_youtube
          ? String(body.social_youtube).trim().slice(0, 512)
          : null;
      }

      if (body.avatar) {
        try {
          const buffer = Buffer.from(await body.avatar.arrayBuffer());
          const processed = await processAvatar(buffer);
          const { url } = await saveProfileImage(
            String(user.data.id),
            "avatar",
            nanoid(),
            processed.buffer,
          );

          if (user.data.avatar) {
            await deleteProfileImage(user.data.avatar).catch(console.error);
          }

          data.avatar = url;
        } catch (err) {
          console.error("Avatar processing failed:", err);
        }
      }

      if (body.banner) {
        try {
          const buffer = Buffer.from(await body.banner.arrayBuffer());
          const processed = await processBanner(buffer);
          const { url } = await saveProfileImage(
            String(user.data.id),
            "banner",
            nanoid(),
            processed.buffer,
          );

          if (user.data.banner) {
            await deleteProfileImage(user.data.banner).catch(console.error);
          }

          data.banner = url;
        } catch (err) {
          console.error("Banner processing failed:", err);
        }
      }

      if (Object.keys(data).length === 0) {
        return "No changes";
      }

      const updated = (await prisma.client.accounts.update({
        data,
        where: {
          id: user.data.id,
        },
      })) as any;

      const { secret: _, ...cacheableUpdated } = updated;
      void redis.redis.setex(
        "user:" + user.data.id + ":info",
        day,
        JSON.stringify(cacheableUpdated),
      );

      // We return the filtered updated user
      return Object.keys(sessionUserSelect).reduce((acc, key) => {
        if ((sessionUserSelect as any)[key]) acc[key] = (updated as any)[key];
        return acc;
      }, {} as any);
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
      await prisma.client.accounts.update({
        data: {
          deleted: new Date(),
        },
        where: {
          id: user.data.id,
        },
      });
      await redis.redis.del(`user:${user.data.id}:info`);
      await redis.redis.del(`email:${user.data.email}`);
      supported_providers.forEach(async (provider) => {
        await redis.redis.del(`user:${user.data!.id}:connections:${provider}`);
      });
      return "OK, Goodbye!";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default router;
