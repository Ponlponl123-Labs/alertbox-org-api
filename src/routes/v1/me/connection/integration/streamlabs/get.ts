import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";
import { streamlabs_redirect_uri } from "@/consts/integration";
import { redis } from "@/core/redis";
import { prisma } from "@/core/prisma";

export const endpoint = new Elysia()
  .use(ip({ headersFirst: true }))
  .get(
    "/",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me({ cache: false }).use(auth, ip, {
        integration: {
          select: {
            streamlabsSecret: true,
            streamlabsOptions: true,
          },
        },
      });
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      return {
        isConnected: !!user.data.integration?.streamlabsSecret,
        options: user.data.integration?.streamlabsOptions ?? null,
      };
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  )
  .get(
    "/oauth2",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me().use(auth, ip, basicUserSelect);
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      const oauth2Url = `https://streamlabs.com/api/v2.0/authorize?client_id=${process.env.STREAMLABS_CLIENT_ID}&redirect_uri=${streamlabs_redirect_uri}&scope=donations.create&response_type=code&state=${user.data.id}`;

      return oauth2Url;
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  )
  .get(
    "/logs",
    async ({ headers, set, ip }) => {
      const auth = isBearerToken(headers.authorization);
      if (!auth) {
        set.status = "Bad Request";
        return "Bad Request";
      }
      const user = await new Me().use(auth, ip, { id: true });
      if (!user || !user.data) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }

      const cacheKey = `redis:streamlabs-relay-logs:${user.data.id}`;
      const cached = await redis.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Query database
      const logs = await prisma.client.streamlabsRelayLog.findMany({
        where: {
          userId: user.data.id,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Cache for 60 seconds (1 minute)
      await redis.redis.set(cacheKey, JSON.stringify(logs), "EX", 60);

      return logs;
    },
    {
      headers: t.Object({
        authorization: t.String(),
      }),
    },
  );

export default endpoint;
