import Elysia, { t } from "elysia";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { orgContext, requireOrgPermission } from "@/core/org";
import { OrgPerm } from "@/consts/permission";
import { updateStreamerCache } from "@/utils/cache-sync";

/**
 * DELETE endpoint to unpublish/deactivate the streamer profile.
 */
export const endpoint = new Elysia()
  .use(orgContext)
  .delete(
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
          publishedAt: null,
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
        summary: "Unpublish creator profile",
        description:
          "Hides the creator's public profile and tipping page (`publishedAt: null`). Visitors attempting to view the page will receive a 404.",
      },
      response: {
        200: t.String({
          description: "Profile unpublished successfully.",
          examples: ["OK"],
        }),
      },
    },
  );

export default endpoint;
