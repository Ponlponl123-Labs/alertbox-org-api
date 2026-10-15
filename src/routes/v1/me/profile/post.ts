import Elysia, { t } from "elysia";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { orgContext, requireOrgPermission } from "@/core/org";
import { OrgPerm } from "@/utils/rbac";
import { updateStreamerCache } from "@/utils/cache-sync";

/**
 * POST endpoint to publish/activate the streamer profile.
 */
export const endpoint = new Elysia()
  .use(orgContext)
  .post(
    "/",
    async ({ org, set }) => {
      if (!org) {
        set.status = "Unauthorized";
        return "Unauthorized";
      }
      if (!requireOrgPermission(org, OrgPerm.STREAMER_MANAGE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to edit streamer profile";
      }

      await prisma.client.streamer.update({
        data: {
          publishedAt: new Date(),
        },
        where: {
          id: org.streamerId,
        },
      });

      await updateStreamerCache({
        id: org.streamerId,
        orgId: org.orgId,
      });

      return "OK";
    },
    {
      detail: {
        tags: ["Creator Profile"],
        summary: "Publish creator profile",
        description:
          "Makes the creator's tipping page and profile publicly visible to everyone. Sets `publishedAt` to current timestamp and flushes the cache.",
      },
      response: {
        200: t.String({
          description: "Profile published successfully.",
          examples: ["OK"],
        }),
      },
    },
  );

export default endpoint;
