import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { authorizeOrg, parseBigIntParam } from "@/core/org";
import { OrgPerm } from "@/consts/permission";

export interface TinyStreamerResponse {
  id: string;
  name: string;
  displayName: string | null;
  avatar: string | null;
}

export async function getTinyStreamer(streamerIdStr: string, orgId: bigint): Promise<TinyStreamerResponse | null> {
  const numericId = parseBigIntParam(streamerIdStr);
  if (!numericId) return null;

  const cacheKey = `streamer:${numericId.toString()}:tiny`;
  const cached = await redis.redis.get(cacheKey);
  if (cached === "deleted") return null;
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch { }
  }

  const orgStreamersKey = `org:${orgId.toString()}:streamers`;
  try {
    const hashCached = await redis.redis.hget(orgStreamersKey, numericId.toString());
    if (hashCached) {
      const parsed = JSON.parse(hashCached);
      if (parsed?.name) {
        return {
          id: String(parsed.id),
          name: parsed.name,
          displayName: parsed.displayName ?? null,
          avatar: parsed.avatar ?? null,
        };
      }
    }
  } catch (err: any) {
    if (err?.message?.includes("WRONGTYPE")) {
      await redis.redis.del(orgStreamersKey).catch(() => { });
    }
  }

  const fullCache = await redis.redis.get(`streamer:${numericId.toString()}:info`);
  if (fullCache) {
    try {
      const parsed = JSON.parse(fullCache);
      if (parsed?.name) {
        const result: TinyStreamerResponse = {
          id: String(parsed.id),
          name: parsed.name,
          displayName: parsed.displayName ?? null,
          avatar: parsed.avatar ?? null,
        };
        await redis.redis.setex(cacheKey, 86400, JSON.stringify(result));
        return result;
      }
    } catch { }
  }

  try {
    const streamer = await prisma.client.streamer.findFirst({
      where: { id: numericId, orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        displayName: true,
        avatar: true,
      },
    });

    if (!streamer) {
      await redis.redis.setex(cacheKey, 300, "deleted");
      return null;
    }

    const result: TinyStreamerResponse = {
      id: String(streamer.id),
      name: streamer.name,
      displayName: streamer.displayName ?? null,
      avatar: streamer.avatar ?? null,
    };

    await redis.redis.setex(cacheKey, 86400, JSON.stringify(result));
    try {
      await redis.redis.hset(orgStreamersKey, numericId.toString(), JSON.stringify(result));
    } catch (err: any) {
      if (err?.message?.includes("WRONGTYPE")) {
        await redis.redis.del(orgStreamersKey).catch(() => { });
        await redis.redis.hset(orgStreamersKey, numericId.toString(), JSON.stringify(result)).catch(() => { });
      }
    }
    return result;
  } catch {
    return null;
  }
}

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/streamers/:streamerId/tiny",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_VIEW, set, "view streamer details");
      if (typeof authRes === "string") return set.status === "Forbidden" ? "Access denied" : authRes;
      const { orgId } = authRes;

      const tiny = await getTinyStreamer(params.streamerId, orgId);
      if (!tiny) {
        set.status = "Not Found";
        return "Streamer channel not found";
      }

      return tiny;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get tiny streamer profile",
        description: "Fetch cached lightweight streamer profile (id, name, displayName, avatar) using Redis cache.",
      },
      params: t.Object({
        orgId: t.String(),
        streamerId: t.String(),
      }),
    },
  );

export default endpoint;
