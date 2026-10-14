import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission, OrgPerm } from "@/utils/rbac";
import { DEFAULT_ALERTBOX_EVENTS } from "@/consts/widget";
import { nanoid } from "nanoid";
import { resolveOrgId, resolveStreamerId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/streamers",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const member = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (!member || !hasPermission(member.permissions, OrgPerm.CREATE_STREAMER)) {
        set.status = "Forbidden";
        return "Insufficient permissions to create streamer channel";
      }

      const name = body.name.trim();
      const displayName = (body.displayName?.trim() || name).slice(0, 64);
      const timestamp = Date.now();
      const widgetToken = `${nanoid(64)}.${timestamp}.${nanoid(64)}`;

      const streamer = await prisma.client.$transaction(async (tx) => {
        const created = await tx.streamer.create({
          data: {
            orgId,
            name,
            displayName,
            widgets: {
              create: {
                orgId,
                type: "ALERTBOX",
                token: widgetToken,
                alertbox: {
                  create: {
                    events: {
                      createMany: {
                        data: DEFAULT_ALERTBOX_EVENTS,
                      },
                    },
                  },
                },
              },
            },
          },
          include: {
            widgets: {
              select: { id: true, type: true, token: true },
            },
          },
        });

        return created;
      });

      await redis.redis.del(`user:${String(user.data.id)}:info`);

      return {
        id: String(streamer.id),
        name: streamer.name,
        displayName: streamer.displayName,
        avatar: streamer.avatar,
        uri: streamer.uri,
        widgets: streamer.widgets.map((w) => ({
          ...w,
          id: String(w.id),
        })),
        createdAt: streamer.createdAt,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Create streamer channel in organization",
        description: "Provisions a new streamer channel with dedicated AlertBox widget.",
      },
      body: t.Object({
        name: t.String({ minLength: 1, maxLength: 64 }),
        displayName: t.Optional(t.String({ maxLength: 64 })),
      }),
    },
  )
  .post(
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
        return "Insufficient permissions to publish streamer channel";
      }

      const updated = await prisma.client.streamer.update({
        where: { id: streamerId },
        data: { publishedAt: new Date() },
      });

      await Promise.all([
        redis.redis.del(`streamer:${String(streamerId)}:info`),
        redis.redis.del(`streamer:${String(streamerId)}:profile`),
        redis.redis.del(`org:${String(orgId)}:primary_streamer`),
        redis.redis.del(`user:${String(user.data.id)}:info`),
      ]);

      return { publishedAt: updated.publishedAt };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Publish streamer channel",
        description: "Makes streamer channel public.",
      },
    },
  );

export default endpoint;
