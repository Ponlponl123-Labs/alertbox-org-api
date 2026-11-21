import Elysia from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { OrgPerm } from "@/consts/permission";
import { authorizeOrg, resolveStreamerId } from "@/core/org";
import { logOrgAudit } from "@/core/audit";
import { KofiWebhook } from "@/classes/webhook/kofi";
import { BmacWebhook } from "@/classes/webhook/bmac";
import {
  streamerParamsSchema,
  okResponseSchema,
  standardErrors,
} from "./schemas";

export const endpoint = new Elysia()
  .use(auth)
  .delete(
    "/:orgId/streamers/:streamerId",
    async ({ getAuthenticatedUser, params, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeOrg(params.orgId, user.data.id, OrgPerm.STREAMER_DELETE, set, "delete streamer channel");
      if (typeof authRes === "string") return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      const { orgId } = authRes;

      const streamerId = await resolveStreamerId(orgId, params.streamerId);
      if (!streamerId) {
        set.status = "Bad Request";
        return "Invalid organization or streamer ID";
      }

      const [streamer, members, widgets] = await Promise.all([
        db.selectFrom("Streamer")
          .select(["id", "name", "uri"])
          .where("id", "=", Number(streamerId))
          .executeTakeFirst(),
        db.selectFrom("OrganizationMember")
          .select(["userId"])
          .where("orgId", "=", Number(orgId))
          .where("isDeleted", "is", null)
          .execute(),
        db.selectFrom("Widget")
          .select(["id", "token"])
          .where("streamerId", "=", Number(streamerId))
          .where("deletedAt", "is", null)
          .execute(),
      ]);

      const now = new Date();

      await db.transaction().execute(async (trx) => {
        await trx
          .updateTable("Streamer")
          .set({ deletedAt: now, updatedAt: now })
          .where("id", "=", Number(streamerId))
          .execute();

        await trx
          .updateTable("ReservedUri")
          .set({ deletedAt: now })
          .where("streamerId", "=", Number(streamerId))
          .where("deletedAt", "is", null)
          .execute();

        await trx
          .updateTable("Widget")
          .set({ deletedAt: now, updatedAt: now })
          .where("streamerId", "=", Number(streamerId))
          .where("deletedAt", "is", null)
          .execute();

        await trx
          .updateTable("Integration")
          .set({ deletedAt: now, updatedAt: now })
          .where("streamerId", "=", Number(streamerId))
          .where("deletedAt", "is", null)
          .execute();
      });

      KofiWebhook.invalidateIntegrations();
      BmacWebhook.invalidateIntegrations();

      const keysToDelete: string[] = [
        `streamer:${String(streamerId)}:info`,
        `streamer:${String(streamerId)}:profile`,
        `streamer:${String(streamerId)}:tiny`,
        `org:${String(orgId)}:streamers`,
        `org:${String(orgId)}:primary_streamer`,
        `org:${String(orgId)}:members`,
      ];

      for (const w of widgets) {
        keysToDelete.push(`widget:${String(w.id)}:info`);
        if (w.token) {
          keysToDelete.push(`widget:token:${w.token}`);
          keysToDelete.push(`widget:${w.token}:info`);
        }
      }

      if (streamer?.uri) {
        keysToDelete.push(`uri:${streamer.uri.toLowerCase()}:owner`);
        keysToDelete.push(`uri:${streamer.uri.toLowerCase()}:registered_date`);
        keysToDelete.push(`streamer:${String(streamerId)}:uri`);
      }

      for (const m of members) {
        keysToDelete.push(`user:${String(m.userId)}:org_list`);
      }

      await Promise.all(keysToDelete.map((k) => redis.redis.del(k)));

      await logOrgAudit({
        orgId,
        userId: user.data.id,
        action: "STREAMER_DELETED",
        targetType: "STREAMER",
        targetId: BigInt(streamerId),
        payload: { name: streamer?.name },
      });

      return "OK";
    },
    {
      params: streamerParamsSchema,
      detail: {
        tags: ["Streamers"],
        summary: "Delete streamer channel",
        description: "Soft deletes a streamer channel. Requires DELETE_STREAMER permission.",
      },
      response: {
        200: okResponseSchema,
        ...standardErrors,
      },
    },
  );

export default endpoint;
