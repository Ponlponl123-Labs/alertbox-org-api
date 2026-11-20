import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg } from "@/core/org";
import { invalidateBmacIntegrations } from "@/routes/v1/webhook/bmac";
import { invalidateKofiIntegrations } from "@/routes/v1/webhook/kofi";

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
        db
          .selectFrom("OrganizationMember")
          .select("userId")
          .where("orgId", "=", Number(orgId))
          .execute(),
        db
          .selectFrom("Streamer")
          .select(["id", "uri"])
          .where("orgId", "=", Number(orgId))
          .execute(),
      ]);

      const now = new Date();
      const numOrgId = Number(orgId);
      const streamerIds = streamers.map((s) => s.id);

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("Organization")
          .set({ deletedAt: now })
          .where("id", "=", numOrgId)
          .execute();

        await trx
          .updateTable("OrganizationMember")
          .set({ isDeleted: now })
          .where("orgId", "=", numOrgId)
          .where("isDeleted", "is", null)
          .execute();

        await trx
          .updateTable("Streamer")
          .set({ deletedAt: now })
          .where("orgId", "=", numOrgId)
          .where("deletedAt", "is", null)
          .execute();

        await trx
          .updateTable("Integration")
          .set({ deletedAt: now })
          .where("orgId", "=", numOrgId)
          .where("deletedAt", "is", null)
          .execute();

        await trx
          .updateTable("Widget")
          .set({ deletedAt: now })
          .where("orgId", "=", numOrgId)
          .where("deletedAt", "is", null)
          .execute();

        if (streamerIds.length > 0) {
          await trx
            .updateTable("ReservedUri")
            .set({ deletedAt: now })
            .where("streamerId", "in", streamerIds)
            .where("deletedAt", "is", null)
            .execute();
        }
      });

      invalidateBmacIntegrations();
      invalidateKofiIntegrations();

      const keysToDelete: string[] = [
        `org:${String(orgId)}:info`,
        `org:${String(orgId)}:streamers`,
        `org:${String(orgId)}:primary_streamer`,
        `org:${String(orgId)}:members`,
        `org:${String(orgId)}:presets`,
      ];

      for (const m of members) {
        keysToDelete.push(`user:${m.userId}:info`);
        keysToDelete.push(`user:${m.userId}:orgs`);
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
