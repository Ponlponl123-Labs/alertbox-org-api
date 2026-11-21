import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";
import { formatKeysetCursor, parseKeysetCursor } from "@/utils/pagination";
import {
  streamerParamsSchema,
  streamerAuditResponseSchema,
  standardErrors,
} from "../schemas";

function safeJsonParse(val: string | null): unknown {
  if (!val) return null;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/streamers/:streamerId/audit",
    async ({ getAuthenticatedUser, params, query, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.STREAMER_VIEW,
          requiredStreamerPerm: StreamerPerm.STREAMER_VIEW,
          actionDescription: "view streamer audit logs",
        },
        set,
      );
      if (typeof authRes === "string") {
        return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      }
      const { orgId, streamerId } = authRes;

      const limit = Math.min(Math.max(Number(query.limit || 10), 1), 100);
      const offset = Math.max(Number(query.offset || 0), 0);

      let countQuery = db
        .selectFrom("OrganizationAuditLog")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("orgId", "=", Number(orgId))
        .where("targetType", "=", "STREAMER")
        .where("targetId", "=", Number(streamerId));

      let logsQuery = db
        .selectFrom("OrganizationAuditLog")
        .innerJoin("User", "User.id", "OrganizationAuditLog.userId")
        .select([
          "OrganizationAuditLog.id",
          "OrganizationAuditLog.orgId",
          "OrganizationAuditLog.action",
          "OrganizationAuditLog.targetType",
          "OrganizationAuditLog.targetId",
          "OrganizationAuditLog.payload",
          "OrganizationAuditLog.ipAddress",
          "OrganizationAuditLog.createdAt",
          "User.id as uId",
          "User.name as uName",
          "User.email as uEmail",
          "User.avatar as uAvatar",
        ])
        .where("OrganizationAuditLog.orgId", "=", Number(orgId))
        .where("OrganizationAuditLog.targetType", "=", "STREAMER")
        .where("OrganizationAuditLog.targetId", "=", Number(streamerId));

      if (query.action) {
        countQuery = countQuery.where("OrganizationAuditLog.action", "=", query.action);
        logsQuery = logsQuery.where("OrganizationAuditLog.action", "=", query.action);
      }

      const parsedCursor = parseKeysetCursor(query.cursor);

      if (parsedCursor) {
        logsQuery = logsQuery.where((eb) =>
          eb.or([
            eb("OrganizationAuditLog.createdAt", "<", parsedCursor.createdAt),
            eb.and([
              eb("OrganizationAuditLog.createdAt", "=", parsedCursor.createdAt),
              eb("OrganizationAuditLog.id", "<", parsedCursor.id),
            ]),
          ]),
        );
      }

      const [countRow, logs] = await Promise.all([
        parsedCursor ? Promise.resolve(null) : countQuery.executeTakeFirst(),
        (parsedCursor
          ? logsQuery.orderBy("OrganizationAuditLog.createdAt", "desc").orderBy("OrganizationAuditLog.id", "desc").limit(limit)
          : logsQuery.orderBy("OrganizationAuditLog.createdAt", "desc").orderBy("OrganizationAuditLog.id", "desc").limit(limit).offset(offset)
        ).execute(),
      ]);

      const total = countRow ? Number(countRow.count ?? 0) : logs.length;
      const lastLog = logs.length === limit ? logs[logs.length - 1] : null;
      const nextCursor = lastLog ? formatKeysetCursor(lastLog.createdAt, lastLog.id) : null;

      return {
        total,
        limit,
        offset,
        nextCursor,
        logs: logs.map((l) => ({
          id: String(l.id),
          orgId: String(l.orgId),
          action: l.action,
          targetType: l.targetType,
          targetId: l.targetId ? String(l.targetId) : null,
          payload: safeJsonParse(l.payload),
          ipAddress: l.ipAddress,
          createdAt: new Date(l.createdAt).toISOString(),
          user: {
            id: String(l.uId),
            name: l.uName,
            email: l.uEmail,
            avatar: l.uAvatar,
          },
        })),
      };
    },
    {
      params: streamerParamsSchema,
      detail: {
        tags: ["Streamer Audit"],
        summary: "Get streamer channel audit logs",
        description: "Returns audit events scoped to a specific streamer channel. Requires VIEW_STREAMERS.",
      },
      query: t.Object({
        action: t.Optional(t.String({ description: "Filter by specific audit action key (e.g. STREAMER_UPDATED)" })),
        limit: t.Optional(t.String({ description: "Number of records per page (default: 10, max: 100)" })),
        offset: t.Optional(t.String({ description: "Page offset (default: 0)" })),
        cursor: t.Optional(t.String({ description: "Keyset pagination cursor (createdAt_id)" })),
      }),
      response: {
        200: streamerAuditResponseSchema,
        ...standardErrors,
      },
    },
  );

export default endpoint;
