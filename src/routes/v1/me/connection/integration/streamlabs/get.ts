import Elysia, { t } from "elysia";
import { isBearerToken } from "@/utils/bearer-token";
import { Me } from "@/classes/me";
import { ip } from "elysia-ip";
import { basicUserSelect } from "@/consts/session";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";
import { redis } from "@/core/redis";
import { prisma } from "@/core/prisma";

const getHandler = async ({ headers, set, ip }: any) => {
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
};

const getValidation = {
  detail: {
    tags: ["Streamlabs Relay"],
    summary: "Get Streamlabs connection status",
    description:
      "Returns whether Streamlabs is linked to the creator account and any configured relay preferences (e.g. donation forwarding flag).",
    responses: {
      200: {
        description: "Streamlabs connection status and options.",
      },
      400: {
        description: "Missing or invalid authorization header.",
      },
      401: {
        description: "Unauthorized session token.",
      },
    },
  },
  headers: t.Object({
    authorization: t.String({
      description: "Bearer session token.",
      examples: ["Bearer ab_sess_123456"],
    }),
  }),
};

export const endpoint = new Elysia()
  .use(ip({ headersFirst: true }))
  .get("/", getHandler, getValidation)
  .get("", getHandler, { ...getValidation, detail: { ...getValidation.detail, hide: true } })
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

      const oauth2Url = `https://streamlabs.com/api/v2.0/authorize?client_id=${process.env.STREAMLABS_CLIENT_ID}&redirect_uri=${integrationRedirectUri[ConnectionProvider.STREAMLABS]}&scope=donations.create&response_type=code&state=${user.data.id}`;

      return oauth2Url;
    },
    {
      detail: {
        tags: ["Streamlabs Relay"],
        summary: "Generate Streamlabs OAuth2 authorization URL",
        description:
          "Builds a pre-authenticated Streamlabs OAuth2 link. Direct the user to this URL in their browser to connect their Streamlabs account.",
      },
      headers: t.Object({
        authorization: t.String({
          description: "Bearer session token.",
          examples: ["Bearer ab_sess_123456"],
        }),
      }),
      response: {
        200: t.String({
          description: "Full Streamlabs OAuth2 redirect URL.",
          examples: ["https://streamlabs.com/api/v2.0/authorize?client_id=..."],
        }),
      },
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
      detail: {
        tags: ["Streamlabs Relay"],
        summary: "Get Streamlabs relay audit logs",
        description:
          "Fetches recent donation relay events (status, timestamps, payloads forwarded to Streamlabs). Results are cached in Redis for 60 seconds.",
      },
      headers: t.Object({
        authorization: t.String({
          description: "Bearer session token.",
          examples: ["Bearer ab_sess_123456"],
        }),
      }),
      response: {
        200: t.Array(
          t.Any(),
          { description: "Array of Streamlabs relay audit log entries." },
        ),
      },
    },
  );

export default endpoint;
