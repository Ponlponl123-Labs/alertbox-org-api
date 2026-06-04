import { day } from "@/consts/time";
import { prisma, redis } from "@/index";
import { Me } from "@/classes/me";
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

      const updated = await prisma.client.profile.update({
        data: {
          publishedAt: new Date(),
        },
        where: {
          userId: user.data.id,
        },
      });

      // Fetch full user for cache sync
      const fullUser = await prisma.client.user.findUnique({
        where: { id: user.data.id },
        include: {
          profile: true,
          widgets: {
            include: {
              alertbox: {
                include: {
                  events: true,
                },
              },
            },
          },
        },
      });

      if (fullUser) {
        void redis.redis.setex(
          "user:" + user.data.id + ":info",
          day,
          JSON.stringify(fullUser),
        );
      }

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

      const user = await new Me().use(authToken, ip, {
        profile: {
          select: {
            uriCooldownEnd: true,
          }
        }
      });
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      const now = Date.now();
      const cooldown =
        user.data.profile?.uriCooldownEnd && new Date(user.data.profile.uriCooldownEnd);
      if (cooldown && cooldown.getTime() > now) {
        set.status = "Too Many Requests";
        return "Please retry again after " + cooldown.getTime();
      }

      const success = await user.profile.registerURI(parsedUri);

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

      const updated = await prisma.client.profile.update({
        data: {
          publishedAt: null,
        },
        where: {
          userId: user.data.id,
        },
      });

      // Fetch full user for cache sync
      const fullUser = await prisma.client.user.findUnique({
        where: { id: user.data.id },
        include: {
          profile: true,
          widgets: {
            include: {
              alertbox: {
                include: {
                  events: true,
                },
              },
            },
          },
        },
      });

      if (fullUser) {
        void redis.redis.setex(
          "user:" + user.data.id + ":info",
          day,
          JSON.stringify(fullUser),
        );
      }

      return "OK";
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default endpoint;
