import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { hasPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg, resolveOrgId } from "@/core/org";

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

      const [org, members] = await Promise.all([
        prisma.client.organization.findUnique({
          where: { id: orgId },
          include: {
            streamers: {
              where: { deletedAt: null },
              select: { id: true, name: true, displayName: true, avatar: true },
            },
          },
        }),
        prisma.client.organizationMember.findMany({
          where: { orgId, isDeleted: null },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
                avatar: true,
                disabledAt: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
        }),
      ]);

      const allStreamers = (org?.streamers || []).map((s) => ({
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
          email: m.user.email,
          name: m.user.name,
          avatar: m.user.avatar,
          role: m.role,
          status: m.user.disabledAt ? "Offline" : "Active",
          permissions: m.permissions.toString(),
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
