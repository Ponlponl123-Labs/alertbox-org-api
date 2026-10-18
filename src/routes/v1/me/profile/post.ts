import Elysia, { t } from "elysia";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { orgContext, requireOrgPermission } from "@/core/org";
import { OrgPerm } from "@/consts/permission";
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

      await db
        .updateTable("Streamer")
        .set({
          publishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where("id", "=", Number(org.streamerId))
        .execute();

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
