import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { OrgPerm, StreamerPerm } from "@/utils/rbac";
import { DEFAULT_ALERTBOX_EVENTS } from "@/consts/widget";
import { nanoid } from "nanoid";
import { authorizeOrg, authorizeStreamer, resolveStreamerId } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .post(
    "/:orgId/streamers",
    async ({ getAuthenticatedUser, params, body, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.STREAMER_CREATE, set, "create streamer channel");
      if (typeof authRes === "string") return authRes;
      const { orgId } = authRes;

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

      const members = await prisma.client.organizationMember.findMany({
        where: { orgId },
        select: { userId: true },
      });

      const keysToDelete = [
        `org:${String(orgId)}:streamers`,
        `org:${String(orgId)}:primary_streamer`,
        `org:${String(orgId)}:members`,
        ...members.map((m) => `user:${String(m.userId)}:org_list`),
      ];

      await Promise.all(keysToDelete.map((k) => redis.redis.del(k)));

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
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.STREAMER_MANAGE,
          requiredStreamerPerm: StreamerPerm.STREAMER_MANAGE,
          actionDescription: "publish streamer channel",
        },
        set,
      );
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId, streamerId } = authRes;

      const updated = await prisma.client.streamer.update({
        where: { id: streamerId },
        data: { publishedAt: new Date() },
      });

      await Promise.all([
        redis.redis.del(`streamer:${String(streamerId)}:info`),
        redis.redis.del(`streamer:${String(streamerId)}:profile`),
        redis.redis.del(`org:${String(orgId)}:streamers`),
        redis.redis.del(`org:${String(orgId)}:primary_streamer`),
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
