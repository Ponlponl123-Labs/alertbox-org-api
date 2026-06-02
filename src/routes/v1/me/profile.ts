import { day } from "@/consts/time";
import { prisma, redis } from "@/index";
import { getMe } from "@/utils/account/me";
import { registerURI } from "@/utils/account/profile";
import { isValidUri } from "@/utils/regex";
import { isBearerToken } from "@/utils/bearer-token";
import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";

export const endpoint = new Elysia({ prefix: "profile" })
  .use(ip())
  .post(
    "/",
    async ({ headers, set, ip }) => {
      const me = await getMe(headers, set, ip);
      if (!me) {
        return set.status === "Bad Request" ? "Bad Request" : "Unauthorized";
      }

      const updated = await prisma.client.accounts.update({
        data: {
          published: new Date(),
        },
        where: {
          id: me.id,
        },
      });

      void redis.redis.setex(
        "user:" + me.id + ":info",
        day,
        JSON.stringify(updated),
      );

      return "OK";
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
      const parsedUri = String(body ?? "")
        .trim()
        .toLowerCase();
      if (!parsedUri || parsedUri.length >= 50 || !isValidUri(parsedUri)) {
        set.status = "Bad Request";
        return "Bad Request";
      }

      const me = await getMe(headers, set, ip);
      if (!me) {
        return set.status === "Bad Request" ? "Bad Request" : "Unauthorized";
      }

      const now = Date.now();
      const cooldown = me.uri_cooldown && new Date(me.uri_cooldown);
      if (cooldown && cooldown.getTime() > now) {
        set.status = "Too Many Requests";
        return "Please retry again after " + cooldown.getTime();
      }

      const auth = isBearerToken(headers.authorization);
      const success = await registerURI(me.id, parsedUri, auth as string);

      if (!success) {
        set.status = "Forbidden";
        return "URI has been registered or is invalid";
      }

      return "OK";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
      body: t.String(),
    },
  )
  .delete(
    "/",
    async ({ headers, set, ip }) => {
      const me = await getMe(headers, set, ip);
      if (!me) {
        return set.status === "Bad Request" ? "Bad Request" : "Unauthorized";
      }

      const updated = await prisma.client.accounts.update({
        data: {
          published: null,
        },
        where: {
          id: me.id,
        },
      });

      void redis.redis.setex(
        "user:" + me.id + ":info",
        day,
        JSON.stringify(updated),
      );

      return "OK";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default endpoint;
