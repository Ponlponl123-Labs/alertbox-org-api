import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { resolveOrgId, resolveStreamerId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/streamers/:streamerId",
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

      if (!member || !hasPermission(member.permissions, OrgPerm.DELETE_STREAMER)) {
        set.status = "Forbidden";
        return "Insufficient permissions to delete streamer channel";
      }

      await prisma.client.streamer.update({
        where: { id: streamerId },
        data: { deletedAt: new Date() },
      });

      await Promise.all([
        redis.redis.del(`streamer:${String(streamerId)}:info`),
        redis.redis.del(`streamer:${String(streamerId)}:profile`),
        redis.redis.del(`org:${String(orgId)}:primary_streamer`),
        redis.redis.del(`user:${String(user.data.id)}:info`),
      ]);

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

      if (!member || !hasPermission(member.permissions, OrgPerm.EDIT_STREAMER_PROFILE)) {
        set.status = "Forbidden";
        return "Insufficient permissions to unpublish streamer channel";
      }

      await prisma.client.streamer.update({
        where: { id: streamerId },
        data: { publishedAt: null },
      });

      await Promise.all([
        redis.redis.del(`streamer:${String(streamerId)}:info`),
        redis.redis.del(`streamer:${String(streamerId)}:profile`),
        redis.redis.del(`org:${String(orgId)}:primary_streamer`),
        redis.redis.del(`user:${String(user.data.id)}:info`),
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
