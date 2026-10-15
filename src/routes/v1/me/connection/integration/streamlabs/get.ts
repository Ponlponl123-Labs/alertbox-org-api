import Elysia, { t } from "elysia";
import { orgContext, requireOrgPermission } from "@/core/org";
import { OrgPerm } from "@/utils/rbac";
import { ConnectionProvider, integrationRedirectUri } from "@/consts/integration";
import { redis } from "@/core/redis";
import { prisma } from "@/core/prisma";

const getValidation = {
  detail: {
    tags: ["Streamlabs Relay"],
    summary: "Get Streamlabs connection status",
    description:
      "Returns whether Streamlabs is linked to the active streamer account and any configured relay preferences.",
    responses: {
      200: {
        description: "Streamlabs connection status and options.",
      },
      401: {
        description: "Unauthorized session token or missing organization.",
      },
      403: {
        description: "Insufficient permissions.",
      },
    },
  },
};

export const endpoint = new Elysia()
  .use(orgContext)
  .get(
    "/",
    async ({ org, set }) => {
      if (!org) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      if (!requireOrgPermission(org, OrgPerm.INTEGRATION_VIEW)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view integrations";
      }

      const integration = await prisma.client.integration.findUnique({
        where: { streamerId: org.streamerId },
        select: {
          streamlabsSecret: true,
          streamlabsOptions: true,
        },
      });

      return {
        isConnected: !!integration?.streamlabsSecret,
        options: integration?.streamlabsOptions ?? null,
      };
    },
    getValidation,
  )
  .get(
    "/oauth2",
    async ({ org, set }) => {
      if (!org) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      if (!requireOrgPermission(org, OrgPerm.INTEGRATION_MANAGE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to configure integrations";
      }

      const state = `${org.streamerId}.${org.orgId}`;
      const oauth2Url = `https://streamlabs.com/api/v2.0/authorize?client_id=${process.env.STREAMLABS_CLIENT_ID}&redirect_uri=${integrationRedirectUri[ConnectionProvider.STREAMLABS]}&scope=donations.create&response_type=code&state=${state}`;

      return oauth2Url;
    },
    {
      detail: {
        tags: ["Streamlabs Relay"],
        summary: "Generate Streamlabs OAuth2 authorization URL",
        description:
          "Builds a pre-authenticated Streamlabs OAuth2 link. Direct the user to this URL in their browser to connect their Streamlabs account.",
      },
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
    async ({ org, set }) => {
      if (!org) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      if (!requireOrgPermission(org, OrgPerm.INTEGRATION_VIEW)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view integration logs";
      }

      const cacheKey = `redis:streamlabs-relay-logs:${org.streamerId}`;
      const cached = await redis.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Query database
      const logs = await prisma.client.streamlabsRelayLog.findMany({
        where: {
          streamerId: org.streamerId,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const formattedLogs = logs.map((l) => ({
        ...l,
        id: String(l.id),
        orgId: String(l.orgId),
        streamerId: String(l.streamerId),
      }));

      // Cache for 60 seconds (1 minute)
      await redis.redis.set(cacheKey, JSON.stringify(formattedLogs), "EX", 60);

      return formattedLogs;
    },
    {
      detail: {
        tags: ["Streamlabs Relay"],
        summary: "Get Streamlabs relay audit logs",
        description:
          "Fetches recent donation relay events (status, timestamps, payloads forwarded to Streamlabs). Results are cached in Redis for 60 seconds.",
      },
      response: {
        200: t.Array(
          t.Any(),
          { description: "Array of Streamlabs relay audit log entries." },
        ),
      },
    },
  );

export default endpoint;
