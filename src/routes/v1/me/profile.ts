import { day } from "@/consts/time";
import { prisma, redis } from "@/index";
import { Me } from "@/classes/me";
import { registerURI } from "@/utils/account/profile";
import { isValidUri } from "@/utils/regex";
import { isBearerToken } from "@/utils/bearer-token";
import Elysia, { t } from "elysia";
import { ip } from "elysia-ip";
import { sessionUserSelect } from "@/consts/session";

export const endpoint = new Elysia({ prefix: "profile" })
  .use(ip())
  .post(
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

      const updated = await prisma.client.accounts.update({
        data: {
          published: new Date(),
        },
        where: {
          id: user.data.id,
        },
      });

      void redis.redis.setex(
        "user:" + user.data.id + ":info",
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

      const authToken = isBearerToken(headers.authorization);
      if (!authToken) {
        set.status = "Bad Request";
        return "Bad Request";
      }

      const user = await new Me().use(authToken, ip, sessionUserSelect);
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      const now = Date.now();
      const cooldown = user.data.uri_cooldown && new Date(user.data.uri_cooldown);
      if (cooldown && cooldown.getTime() > now) {
        set.status = "Too Many Requests";
        return "Please retry again after " + cooldown.getTime();
      }

      const success = await registerURI(user.data.id, parsedUri, authToken);

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

      const updated = await prisma.client.accounts.update({
        data: {
          published: null,
        },
        where: {
          id: user.data.id,
        },
      });

      void redis.redis.setex(
        "user:" + user.data.id + ":info",
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
