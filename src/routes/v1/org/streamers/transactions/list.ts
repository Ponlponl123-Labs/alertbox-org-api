import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { OrgPerm, StreamerPerm } from "@/consts/permission";
import { authorizeStreamer } from "@/core/org";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/streamers/:streamerId/transactions",
    async ({ getAuthenticatedUser, params, query, set }) => {
      const user = await getAuthenticatedUser();
      const authRes = await authorizeStreamer(
        params.orgId,
        params.streamerId,
        user.data.id,
        {
          requiredOrgPerm: OrgPerm.TRANSACTION_VIEW,
          requiredStreamerPerm: StreamerPerm.STREAMER_TRANSACTION_VIEW,
          actionDescription: "view streamer transactions",
        },
        set,
      );
      if (typeof authRes === "string") {
        return set.status === "Bad Request" ? "Invalid organization or streamer ID" : authRes;
      }
      const { orgId, streamerId } = authRes;

      const limit = Math.min(Math.max(Number(query.limit || 25), 1), 100);
      const offset = Math.max(Number(query.offset || 0), 0);

      let countQuery = db
        .selectFrom("TransactionLog")
        .select((eb) => eb.fn.count("id").as("count"))
        .where("orgId", "=", Number(orgId))
        .where("streamerId", "=", Number(streamerId));

      let itemsQuery = db
        .selectFrom("TransactionLog")
        .select([
          "id",
          "provider",
          "type",
          "status",
          "isTest",
          "amount",
          "currency",
          "senderName",
          "message",
          "createdAt",
          "isDeleted",
        ])
        .where("orgId", "=", Number(orgId))
        .where("streamerId", "=", Number(streamerId));

      if (query.provider && query.provider !== "ALL") {
        countQuery = countQuery.where("provider", "=", query.provider.toUpperCase());
        itemsQuery = itemsQuery.where("provider", "=", query.provider.toUpperCase());
      }
      if (query.status && query.status !== "ALL") {
        countQuery = countQuery.where("status", "=", query.status.toUpperCase() as any);
        itemsQuery = itemsQuery.where("status", "=", query.status.toUpperCase() as any);
      }
      if (query.type && query.type !== "ALL") {
        countQuery = countQuery.where("type", "=", query.type.toUpperCase() as any);
        itemsQuery = itemsQuery.where("type", "=", query.type.toUpperCase() as any);
      }
      if (query.search && query.search.trim()) {
        const s = `%${query.search.trim()}%`;
        const filter = (eb: any) =>
          eb.or([
            eb("senderName", "like", s),
            eb("message", "like", s),
          ]);
        countQuery = countQuery.where(filter);
        itemsQuery = itemsQuery.where(filter);
      }

      const orderByField = query.sortBy === "amount" ? "amount" : "createdAt";
      const orderDirection = query.sortOrder === "asc" ? "asc" : "desc";

      const [countRow, items] = await Promise.all([
        countQuery.executeTakeFirst(),
        itemsQuery.orderBy(orderByField, orderDirection).limit(limit).offset(offset).execute(),
      ]);

      const total = Number(countRow?.count ?? 0);

      return {
        total,
        limit,
        offset,
        transactions: items.map((tx) => ({
          id: String(tx.id),
          provider: tx.provider,
          type: tx.type,
          status: tx.status,
          isTest: Boolean(tx.isTest),
          amount: Number(tx.amount),
          currency: tx.currency,
          senderName: tx.senderName,
          message: tx.message,
          createdAt: new Date(tx.createdAt).toISOString(),
          isDeleted: tx.isDeleted !== null,
        })),
      };
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get streamer transactions",
        description: "Returns sanitized, filterable transactions for a streamer channel without exposing internal raw payloads.",
      },
      query: t.Object({
        provider: t.Optional(t.String()),
        status: t.Optional(t.String()),
        type: t.Optional(t.String()),
        search: t.Optional(t.String()),
        sortBy: t.Optional(t.String()),
        sortOrder: t.Optional(t.String()),
        limit: t.Optional(t.String()),
        offset: t.Optional(t.String()),
      }),
    },
  );

export default endpoint;
