import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId, resolveStreamerId } from "@/core/org";
import { resolveProvider, removeConnection } from "@/classes/streamer";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/streamers/:streamerId/connections/:provider",
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

      if (!member || !hasPermission(member.permissions, OrgPerm.MANAGE_INTEGRATIONS)) {
        set.status = "Forbidden";
        return "Insufficient permissions to manage integrations";
      }

      const provider = resolveProvider(params.provider ?? "");
      if (!provider) {
        set.status = "Bad Request";
        return "Not supported provider";
      }

      await removeConnection(streamerId, provider);
      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Remove streamer channel connection",
        description: "Unlinks payment provider credentials from a streamer channel.",
      },
    },
  );

export default endpoint;
