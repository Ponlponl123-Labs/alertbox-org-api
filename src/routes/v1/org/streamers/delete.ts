import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
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
        prisma.client.streamer.findUnique({
          where: { id: streamerId },
          select: { id: true, name: true, uri: true },
        }),
        prisma.client.organizationMember.findMany({
          where: { orgId },
          select: { userId: true },
        }),
      ]);

      const now = new Date();

      await prisma.client.$transaction([
        prisma.client.streamer.update({
          where: { id: streamerId },
          data: { deletedAt: now },
        }),
        prisma.client.reservedUri.updateMany({
          where: { streamerId, deletedAt: null },
          data: { deletedAt: now },
        }),
      ]);

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
        targetId: streamerId,
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

      await prisma.client.streamer.update({
        where: { id: streamerId },
        data: { publishedAt: null },
      });

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
