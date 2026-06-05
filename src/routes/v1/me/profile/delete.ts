import Elysia, { t } from "elysia";
import { day } from "@/consts/time";
import { prisma, redis } from "@/index";
import { Me } from "@/classes/me";
import { isBearerToken } from "@/utils/bearer-token";
import { ip } from "elysia-ip";
import { sessionUserSelect } from "@/consts/session";

/**
 * DELETE endpoint to unpublish/deactivate the user profile.
 */
export const endpoint = new Elysia()
  .use(ip())
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

      await prisma.client.profile.update({
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
