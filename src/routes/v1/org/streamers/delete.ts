import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeOrg, authorizeStreamer, resolveStreamerId } from "@/core/org";
import { logOrgAudit } from "@/core/audit";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/streamers/:streamerId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.STREAMER_DELETE, set, "delete streamer channel");
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId } = authRes;

      const streamerId = await resolveStreamerId(orgId, params.streamerId);
      if (!streamerId) {
        set.status = "Bad Request";
        return "Invalid organization or streamer ID";
      }

      const [streamer, members] = await Promise.all([
        db.selectFrom("Streamer")
          .select(["id", "name", "uri"])
          .where("id", "=", Number(streamerId))
          .executeTakeFirst(),
        db.selectFrom("OrganizationMember")
          .select(["userId"])
          .where("orgId", "=", Number(orgId))
          .where("isDeleted", "is", null)
          .execute(),
      ]);

      const now = new Date();

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("Streamer")
          .set({ deletedAt: now, updatedAt: now })
          .where("id", "=", Number(streamerId))
          .execute();

        await trx
          .updateTable("ReservedUri")
          .set({ deletedAt: now })
          .where("streamerId", "=", Number(streamerId))
          .where("deletedAt", "is", null)
          .execute();
      });

      const keysToDelete: string[] = [
        `streamer:${String(streamerId)}:info`,
        `streamer:${String(streamerId)}:profile`,
        `org:${String(orgId)}:streamers`,
        `org:${String(orgId)}:primary_streamer`,
        `org:${String(orgId)}:members`,
      ];

      if (streamer?.uri) {
        keysToDelete.push(`uri:${streamer.uri.toLowerCase()}:owner`);
        keysToDelete.push(`uri:${streamer.uri.toLowerCase()}:registered_date`);
        keysToDelete.push(`streamer:${String(streamerId)}:uri`);
      }

      for (const m of members) {
        keysToDelete.push(`user:${String(m.userId)}:org_list`);
      }

      await Promise.all(keysToDelete.map((k) => redis.redis.del(k)));

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "STREAMER_DELETED",
        targetType: "STREAMER",
        targetId: BigInt(streamerId),
        payload: { name: streamer?.name },
      });

      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Delete streamer channel",
        description: "Soft deletes a streamer channel. Requires DELETE_STREAMER permission.",
      },
    },
  )
  .delete(
    "/:orgId/streamers/:streamerId/publish",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.STREAMER_MANAGE,
          requiredStreamerPerm: StreamerPerm.STREAMER_MANAGE,
          actionDescription: "unpublish streamer channel",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId, streamerId } = authRes;

      await db
        .updateTable("Streamer")
        .set({ publishedAt: null, updatedAt: new Date() })
        .where("id", "=", Number(streamerId))
        .execute();

      await Promise.all([
        redis.redis.del(`streamer:${String(streamerId)}:info`),
        redis.redis.del(`streamer:${String(streamerId)}:profile`),
        redis.redis.del(`org:${String(orgId)}:streamers`),
        redis.redis.del(`org:${String(orgId)}:primary_streamer`),
      ]);

      return { publishedAt: null };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Unpublish streamer channel",
        description: "Unpublishes streamer channel public page.",
      },
    },
  );

export default endpoint;
