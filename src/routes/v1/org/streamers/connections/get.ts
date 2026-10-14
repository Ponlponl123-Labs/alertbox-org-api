import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId, resolveStreamerId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/streamers/:streamerId/connections",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization or streamer ID";
      }
      const streamerId = await resolveStreamerId(orgId, params.streamerId);
      if (!streamerId) {
        set.status = "Bad Request";
        return "Invalid organization or streamer ID";
      }

      const member = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!member || !hasPermission(member.permissions, OrgPerm.VIEW_INTEGRATIONS)) {
        set.status = "Forbidden";
        return "Insufficient permissions to view integrations";
      }

      const integration = await prisma.client.integration.findUnique({
        where: { streamerId },
      });

      return {
        stripe: integration?.stripeSecret ?? null,
        bmac: integration?.bmacSecret
          ? {
              username: integration.bmacUsername ?? "",
              secret: integration.bmacSecret,
            }
          : null,
        kofi: integration?.kofiSecret
          ? {
              username: integration.kofiUsername ?? "",
              secret: integration.kofiSecret,
            }
          : null,
        xendit: integration?.xenditSecret ?? null,
        ffp: integration?.ffpSecret ?? null,
        youtube: null,
        facebook: null,
        twitch: null,
        patreon: null,
        streamlabs: integration?.streamlabsSecret ? true : false,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get streamer channel connections",
        description: "Returns connected payment providers and triggers for a specific streamer channel.",
      },
    },
  );

export default endpoint;
