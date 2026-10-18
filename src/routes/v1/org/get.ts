import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { day } from "@/consts/time";

export const listOrgsEndpoint = new Elysia()
  .use(auth)
  .get(
    "/",
    async ({ getAuthenticatedUser }) => {
      const user = await getAuthenticatedUser();
      const cacheKey = `user:${String(user.data.id)}:org_list`;
      const cached = await redis.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch {}
      }

      const memberships = await db
        .selectFrom("OrganizationMember")
        .innerJoin("Organization", "Organization.id", "OrganizationMember.orgId")
        .select([
          "Organization.id as orgId",
          "Organization.type as type",
          "Organization.name as name",
          "Organization.slug as slug",
          "Organization.avatar as avatar",
          "Organization.banner as banner",
          "Organization.ownerId as ownerId",
          "Organization.createBy as createBy",
          "Organization.createdAt as orgCreatedAt",
          "OrganizationMember.role as role",
          "OrganizationMember.permissions as permissions",
          "OrganizationMember.createdAt as joinedAt",
        ])
        .where("OrganizationMember.userId", "=", Number(user.data.id))
        .where("OrganizationMember.isDeleted", "is", null)
        .where("Organization.deletedAt", "is", null)
        .orderBy("OrganizationMember.createdAt", "asc")
        .execute();

      if (memberships.length === 0) return [];

      const orgIds = memberships.map((m) => m.orgId);
      const [streamers, memberCounts] = await Promise.all([
        db
          .selectFrom("Streamer")
          .select(["id", "orgId", "name", "displayName", "avatar", "uri"])
          .where("orgId", "in", orgIds)
          .where("deletedAt", "is", null)
          .execute(),
        db
          .selectFrom("OrganizationMember")
          .select(["orgId", (eb) => eb.fn.count("id").as("count")])
          .where("orgId", "in", orgIds)
          .where("isDeleted", "is", null)
          .groupBy("orgId")
          .execute(),
      ]);

      const streamersByOrg = new Map<string, any[]>();
      for (const s of streamers) {
        const key = String(s.orgId);
        const list = streamersByOrg.get(key) ?? [];
        list.push({ ...s, id: String(s.id) });
        streamersByOrg.set(key, list);
      }

      const countsByOrg = new Map<string, number>();
      for (const c of memberCounts) {
        countsByOrg.set(String(c.orgId), Number(c.count));
      }

      const result = memberships.map((m) => {
        const orgInfo = {
          id: String(m.orgId),
          type: m.type,
          name: m.name,
          slug: m.slug,
          avatar: m.avatar,
          banner: m.banner,
          ownerId: String(m.ownerId),
          createBy: String(m.createBy),
          createdAt: m.orgCreatedAt,
        };
        void redis.redis.setex(`org:${String(m.orgId)}:info`, day, JSON.stringify(orgInfo)).catch(() => {});

        return {
          id: String(m.orgId),
          type: m.type,
          name: m.name,
          slug: m.slug,
          avatar: m.avatar,
          banner: m.banner,
          role: m.role,
          permissions: m.permissions.toString(),
          memberCount: countsByOrg.get(String(m.orgId)) ?? 0,
          streamers: streamersByOrg.get(String(m.orgId)) ?? [],
          joinedAt: m.joinedAt,
        };
      });

      await redis.redis.setex(cacheKey, 3600, JSON.stringify(result));
      return result;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List user organizations",
        description: "Returns all organizations where the user is an active member or owner.",
      },
      response: {
        200: t.Array(
          t.Object({
            id: t.String(),
            type: t.String(),
            name: t.String(),
            slug: t.String(),
            avatar: t.Nullable(t.String()),
            banner: t.Nullable(t.String()),
            role: t.String(),
            permissions: t.String(),
            memberCount: t.Number(),
            streamers: t.Array(
              t.Object({
                id: t.String(),
                name: t.String(),
                displayName: t.String(),
                avatar: t.Nullable(t.String()),
                uri: t.Nullable(t.String()),
              }),
            ),
            joinedAt: t.Date(),
          }),
        ),
      },
    },
  );

export default listOrgsEndpoint;
