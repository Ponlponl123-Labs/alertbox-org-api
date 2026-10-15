import Elysia from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { OrgPerm } from "@/utils/rbac";
import { authorizeOrg } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.ORG_DELETE, set, "delete organization");
      if (typeof authRes === "string") return authRes;
      const { orgId, role } = authRes;

      if (role !== "OWNER") {
        set.status = "Forbidden";
        return "Only the organization OWNER can delete the organization";
      }

      // Fetch all members and streamers before soft deleting
      const [members, streamers] = await Promise.all([
        prisma.client.organizationMember.findMany({
          where: { orgId },
          select: { userId: true },
        }),
        prisma.client.streamer.findMany({
          where: { orgId },
          select: { id: true, uri: true },
        }),
      ]);

      const now = new Date();

      await prisma.client.$transaction([
        prisma.client.organization.update({
          where: { id: orgId },
          data: { deletedAt: now },
        }),
        prisma.client.streamer.updateMany({
          where: { orgId, deletedAt: null },
          data: { deletedAt: now },
        }),
        prisma.client.reservedUri.updateMany({
          where: { streamer: { orgId }, deletedAt: null },
          data: { deletedAt: now },
        }),
      ]);

      const keysToDelete: string[] = [
        `org:${String(orgId)}:info`,
        `org:${String(orgId)}:streamers`,
        `org:${String(orgId)}:primary_streamer`,
        `org:${String(orgId)}:members`,
        `org:${String(orgId)}:presets`,
      ];

      for (const m of members) {
        keysToDelete.push(`user:orgs:${m.userId}`);
        keysToDelete.push(`user:${m.userId}:org_list`);
        keysToDelete.push(`user:primary_org:${m.userId}`);
      }

      for (const s of streamers) {
        keysToDelete.push(`streamer:${String(s.id)}:info`);
        keysToDelete.push(`streamer:${String(s.id)}:profile`);
        if (s.uri) {
          keysToDelete.push(`uri:${s.uri.toLowerCase()}:owner`);
          keysToDelete.push(`uri:${s.uri.toLowerCase()}:registered_date`);
          keysToDelete.push(`streamer:${String(s.id)}:uri`);
        }
      }

      await Promise.all(keysToDelete.map((k) => redis.redis.del(k)));

      return "OK";
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Delete organization",
        description: "Soft deletes an organization. Requires DELETE_ORG permission (OWNER only).",
      },
    },
  );

export default endpoint;
