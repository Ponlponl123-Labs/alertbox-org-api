import { useSession } from "@/utils/account/session";
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

import { filterSessionUser } from "@/utils/account/me";
import { accounts } from "@/generated/prisma/client";

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
      const me = (await useSession(auth, ip)) as accounts | null | false;
      if (!me) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      return filterSessionUser(me);
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
      const me = (await useSession(auth, ip)) as accounts | null | false;
      if (!me) {
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
            String(me.id),
            "avatar",
            nanoid(),
            processed.buffer,
          );

          if (me.avatar) {
            await deleteProfileImage(me.avatar).catch(console.error);
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
            String(me.id),
            "banner",
            nanoid(),
            processed.buffer,
          );

          if (me.banner) {
            await deleteProfileImage(me.banner).catch(console.error);
          }

          data.banner = url;
        } catch (err) {
          console.error("Banner processing failed:", err);
        }
      }

      if (Object.keys(data).length === 0) {
        return "No changes";
      }

      const updated = await prisma.client.accounts.update({
        data,
        where: {
          id: me.id,
        },
      });

      void redis.redis.setex(
        "user:" + me.id + ":info",
        day,
        JSON.stringify(updated),
      );

      return filterSessionUser(updated);
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
      const me = await useSession(auth, ip);
      if (!me) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      await prisma.client.accounts.update({
        data: {
          deleted: new Date(),
        },
        where: {
          id: me.id,
        },
      });
      await redis.redis.del(`user:${me.id}:info`);
      await redis.redis.del(`email:${me.email}`);
      supported_providers.forEach(async (provider) => {
        await redis.redis.del(`user:${me.id}:connections:${provider}`);
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
