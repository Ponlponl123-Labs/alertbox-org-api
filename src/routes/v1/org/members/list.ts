import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/members",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_VIEW, set, "view organization");
      if (typeof authRes === "string") return set.status === "Forbidden" ? "Access denied" : authRes;
      const { orgId } = authRes;

      const cachedMembers = await redis.redis.get(`org:${String(orgId)}:members`);
      if (cachedMembers) {
        try {
          return JSON.parse(cachedMembers);
        } catch {}
      }

      const [streamers, members] = await Promise.all([
        db.selectFrom("Streamer")
          .select(["id", "name", "displayName", "avatar"])
          .where("orgId", "=", Number(orgId))
          .where("deletedAt", "is", null)
          .execute(),
        db.selectFrom("OrganizationMember")
          .innerJoin("User", "User.id", "OrganizationMember.userId")
          .select([
            "OrganizationMember.id",
            "OrganizationMember.userId",
            "OrganizationMember.role",
            "OrganizationMember.permissions",
            "OrganizationMember.createdAt",
            "User.email",
            "User.name",
            "User.avatar",
            "User.disabledAt",
          ])
          .where("OrganizationMember.orgId", "=", Number(orgId))
          .where("OrganizationMember.isDeleted", "is", null)
          .orderBy("OrganizationMember.createdAt", "asc")
          .execute(),
      ]);

      const allStreamers = streamers.map((s) => ({
        id: String(s.id),
        name: s.name,
        displayName: s.displayName,
        avatar: s.avatar,
      }));

      const fullStreamerPerms = [
        "READ_STREAMER_BASIC",
        "WRITE_STREAMER_BASIC",
        "READ_STREAMER_TRANSACTION",
        "READ_STREAMER_ANALISTIC",
        "MANAGE_STREAMER_WIDGETS",
        "MANAGE_STREAMER_INTEGRATIONS",
      ];

      const assignmentKeys = members.map((m) => `org:${String(orgId)}:member:${String(m.id)}:streamers`);
      const cachedAssignments = assignmentKeys.length > 0 ? await redis.redis.mget(assignmentKeys) : [];

      const result = members.map((m, idx) => {
        const isFull = m.role === "OWNER" || m.role === "ADMIN";
        let assignments: { streamerId: string; permissions: string[] }[] = [];
        if (isFull) {
          assignments = allStreamers.map((s) => ({ streamerId: s.id, permissions: fullStreamerPerms }));
        } else if (cachedAssignments[idx]) {
          try {
            assignments = JSON.parse(cachedAssignments[idx]!);
          } catch {}
        }

        const memberStreamers = isFull
          ? allStreamers
          : allStreamers.filter((s) => assignments.some((a) => a.streamerId === s.id));

        return {
          id: String(m.id),
          userId: String(m.userId),
          email: m.email,
          name: m.name,
          avatar: m.avatar,
          role: m.role,
          status: m.disabledAt ? "Offline" : "Active",
          permissions: String(m.permissions),
          joinedAt: m.createdAt,
          streamerAssignments: assignments,
          streamers: memberStreamers,
        };
      });

      void redis.redis.setex(`org:${String(orgId)}:members`, 3600, JSON.stringify(result)).catch(() => {});
      return result;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "List organization members",
        description: "Returns all members of an organization with roles and bitmask permissions.",
      },
    },
  );

export default endpoint;
