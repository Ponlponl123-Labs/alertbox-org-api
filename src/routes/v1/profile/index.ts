import { day } from "@/consts/time";
import { prisma, redis } from "@/index";
import { registeredUri } from "@/utils/account/profile";
import { isValidUri } from "@/utils/regex";
import Elysia, { t } from "elysia";

import { accounts } from "@/generated/prisma/client";

export const router = new Elysia({ prefix: "profile" })
  .get(
    "/:uri",
    async ({ params, set }) => {
      const parsedUri = String(params.uri ?? "")
        .trim()
        .toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      if (await registeredUri(parsedUri)) return "OK";
      set.status = "Not Found";
      return "Not Found";
    },
    {
      params: t.Object({
        uri: t.String(),
      }),
    },
  )
  .get(
    "/:uri/details",
    async ({ params, set }) => {
      const parsedUri = String(params.uri ?? "")
        .trim()
        .toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const owner = await registeredUri(parsedUri);
      if (!owner) {
        set.status = "Not Found";
        return "Not Found";
      }

      const filterDetail = (detail: any) => ({
        avatar: detail.avatar,
        banner: detail.banner,
        displayname: detail.displayname,
        bio: detail.bio,
        social_discord: detail.social_discord,
        social_facebook: detail.social_facebook,
        social_reddit: detail.social_reddit,
        social_twitchtv: detail.social_twitchtv,
        social_twitter: detail.social_twitter,
        social_youtube: detail.social_youtube,
        published: detail.published,
        disabled: detail.disabled,
        deleted: detail.deleted,
      });

      const t = await redis.redis.get("user:" + owner + ":info");
      if (t === "deleted") {
        set.status = "Forbidden";
        return "Forbidden";
      } else if (t) {
        const parsed: accounts = JSON.parse(t);
        if (!parsed.published || parsed.disabled || parsed.deleted) {
          set.status = "Forbidden";
          return "Forbidden";
        }
        return filterDetail(parsed);
      }
      const user = await prisma.client.accounts.findFirst({
        where: {
          id: owner,
        },
      });
      if (!user) {
        set.status = "Not Found";
        return "Not Found";
      }

      if (!user.published || user.disabled || user.deleted) {
        if (user.deleted)
          void redis.redis.setex("user:" + owner + ":info", day, "deleted");
        set.status = "Forbidden";
        return "Forbidden";
      }
      void redis.redis.setex(
        "user:" + owner + ":info",
        day,
        JSON.stringify(user),
      );
      if (user?.uri)
        redis.redis.setex("user:" + owner + ":uri", day, user?.uri);
      if (user?.uri_cooldown)
        redis.redis.setex(
          "user:" + owner + ":uri_cooldown",
          day,
          String(user?.uri_cooldown.getTime()),
        );

      return filterDetail(user);
    },
    {
      params: t.Object({
        uri: t.String(),
      }),
    },
  );

export default router;
