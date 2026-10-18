import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { resolveOrgId } from "@/core/org";
import { day } from "@/consts/time";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const orgKey = `org:${String(orgId)}:info`;
      const streamersKey = `org:${String(orgId)}:streamers`;
      const userOrgsKey = `user:${String(user.data.id)}:orgs`;

      const [cachedOrg, cachedStreamersVals, cachedMemberPerms] = await Promise.all([
        redis.redis.get(orgKey).catch(() => null),
        redis.redis.hvals(streamersKey).catch(async (err: any) => {
          if (err?.message?.includes("WRONGTYPE")) {
            await redis.redis.del(streamersKey).catch(() => {});
          }
          return null;
        }),
        redis.redis.hget(userOrgsKey, String(orgId)).catch(async (err: any) => {
          if (err?.message?.includes("WRONGTYPE")) {
            await redis.redis.del(userOrgsKey).catch(() => {});
          }
          return null;
        }),
      ]);

      if (cachedOrg && cachedStreamersVals && cachedStreamersVals.length > 0 && cachedMemberPerms) {
        try {
          const org = JSON.parse(cachedOrg);
          const streamers = cachedStreamersVals.map((v) => JSON.parse(v));
          const [role, permissions] = cachedMemberPerms.split(":");
          return {
            id: String(org.id),
            name: org.name,
            slug: org.slug,
            avatar: org.avatar,
            banner: org.banner,
            role,
            permissions,
            memberCount: org.memberCount ?? streamers.length,
            streamers,
            createdAt: org.createdAt,
          };
        } catch {}
      }

      const member = await db
        .selectFrom("OrganizationMember")
        .innerJoin("Organization", "Organization.id", "OrganizationMember.orgId")
        .select([
          "OrganizationMember.id as memberId",
          "OrganizationMember.role as role",
          "OrganizationMember.permissions as permissions",
          "OrganizationMember.isDeleted as memberDeletedAt",
          "Organization.id as orgId",
          "Organization.name as orgName",
          "Organization.slug as orgSlug",
          "Organization.avatar as orgAvatar",
          "Organization.banner as orgBanner",
          "Organization.ownerId as orgOwnerId",
          "Organization.createBy as orgCreateBy",
          "Organization.createdAt as orgCreatedAt",
          "Organization.deletedAt as orgDeletedAt",
        ])
        .where("OrganizationMember.orgId", "=", Number(orgId))
        .where("OrganizationMember.userId", "=", Number(user.data.id))
        .executeTakeFirst();

      if (!member || member.memberDeletedAt || member.orgDeletedAt) {
        set.status = "Not Found";
        return "Organization not found";
      }

      const [memberCountRow, streamers] = await Promise.all([
        db
          .selectFrom("OrganizationMember")
          .select((eb) => eb.fn.count("id").as("count"))
          .where("orgId", "=", Number(orgId))
          .where("isDeleted", "is", null)
          .executeTakeFirst(),
        db
          .selectFrom("Streamer")
          .select(["id", "name", "displayName", "avatar", "uri", "publishedAt"])
          .where("orgId", "=", Number(orgId))
          .where("deletedAt", "is", null)
          .execute(),
      ]);

      const memberCount = Number(memberCountRow?.count ?? 0);
      const streamerList = streamers.map((s) => ({
        ...s,
        id: String(s.id),
      }));

      const orgInfo = {
        id: String(member.orgId),
        name: member.orgName,
        slug: member.orgSlug,
        avatar: member.orgAvatar,
        banner: member.orgBanner,
        ownerId: String(member.orgOwnerId),
        createBy: String(member.orgCreateBy),
        memberCount,
        createdAt: member.orgCreatedAt,
      };

      const cacheTasks: Promise<any>[] = [
        redis.redis.setex(orgKey, day, JSON.stringify(orgInfo)),
        redis.redis.hset(userOrgsKey, String(orgId), `${member.role}:${member.permissions.toString()}`),
      ];

      if (streamerList.length > 0) {
        const streamerMap: Record<string, string> = {};
        for (const s of streamerList) {
          streamerMap[s.id] = JSON.stringify(s);
        }
        cacheTasks.push(
          redis.redis.hset(streamersKey, streamerMap),
          redis.redis.expire(streamersKey, 3600),
        );
      }

      await Promise.all(cacheTasks);

      return {
        id: String(member.orgId),
        name: member.orgName,
        slug: member.orgSlug,
        avatar: member.orgAvatar,
        banner: member.orgBanner,
        role: member.role,
        permissions: member.permissions.toString(),
        memberCount,
        streamers: streamerList,
        createdAt: member.orgCreatedAt,
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get organization details",
        description: "Retrieves details of an organization if the user is a member.",
      },
    },
  );

export default endpoint;
