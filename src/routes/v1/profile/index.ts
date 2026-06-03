import { day } from "@/consts/time";
import { prisma, redis } from "@/index";
import { isValidUri } from "@/utils/regex";
import Elysia, { t } from "elysia";

import { accounts } from "@/generated/prisma/client";
import { Me } from "@/classes/me";

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
      if (await Me.getURIOwner(parsedUri)) return "OK";
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
      const owner = await Me.getURIOwner(parsedUri);
      if (!owner) {
        set.status = "Not Found";
        return "Not Found";
      }

      const user = await new Me().load(owner, {
        avatar: true,
        banner: true,
        displayname: true,
        bio: true,
        social_discord: true,
        social_facebook: true,
        social_reddit: true,
        social_twitchtv: true,
        social_twitter: true,
        social_youtube: true,
        published: true,
        disabled: true,
        deleted: true,
      });

      if (!user || !user.data) {
        set.status = "Not Found";
        return "Not Found";
      }

      if (!user.data.published || user.data.disabled || user.data.deleted) {
        set.status = "Forbidden";
        return "Forbidden";
      }

      const { id: _, ...publicData } = user.data;
      return publicData;
    },
    {
      params: t.Object({
        uri: t.String(),
      }),
    },
  );

export default router;
