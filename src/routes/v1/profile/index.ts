import { day } from "@/consts/time";
import { prisma, redis } from "@/index";
import { SessionUser } from "@/types/account.types";
import { registeredUri } from "@/utils/account/profile";
import { isValidUri } from "@/utils/regex";
import Elysia, { t } from "elysia";

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
      const t = await redis.redis.get("user:" + owner + ":info");
      if (t === "deleted") {
        set.status = "Forbidden";
        return "Forbidden";
      } else if (t) {
        const parsed: SessionUser = JSON.parse(t);
        return {
          avatar: parsed.avatar,
          banner: parsed.banner,
          displayname: parsed.displayname,
          bio: parsed.bio,
          published: parsed.published,
          disabled: parsed.disabled,
          deleted: parsed.deleted,
        };
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
      const { secret, ...detail } = user;
      if (!detail.published || detail.disabled || detail.deleted) {
        if (detail.deleted)
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
        redis.redis.setex("user:" + owner + ":uid", day, user?.uri);
      if (user?.uri_cooldown)
        redis.redis.setex(
          "user:" + owner + ":uri_cooldown",
          day,
          String(user?.uri_cooldown.getTime()),
        );
      return {
        avatar: detail.avatar,
        banner: detail.banner,
        displayname: detail.displayname,
        bio: detail.bio,
        published: detail.published,
        disabled: detail.disabled,
        deleted: detail.deleted,
      };
    },
    {
      params: t.Object({
        uri: t.String(),
      }),
    },
  );

export default router;
