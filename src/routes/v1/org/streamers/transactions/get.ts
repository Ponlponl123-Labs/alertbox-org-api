import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { OrgPerm, StreamerPerm } from "@/utils/rbac";
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

      const where: any = { orgId, streamerId };

      if (query.provider && query.provider !== "ALL") {
        where.provider = query.provider.toUpperCase();
      }
      if (query.status && query.status !== "ALL") {
        where.status = query.status.toUpperCase();
      }
      if (query.type && query.type !== "ALL") {
        where.type = query.type.toUpperCase();
      }
      if (query.search && query.search.trim()) {
        const s = query.search.trim();
        where.OR = [
          { senderName: { contains: s } },
          { message: { contains: s } },
        ];
      }

      const orderByField = query.sortBy === "amount" ? "amount" : "createdAt";
      const orderDirection = query.sortOrder === "asc" ? "asc" : "desc";

      const [total, items] = await Promise.all([
        prisma.client.transactionLog.count({ where }),
        prisma.client.transactionLog.findMany({
          where,
          orderBy: { [orderByField]: orderDirection },
          take: limit,
          skip: offset,
          select: {
            id: true,
            provider: true,
            type: true,
            status: true,
            isTest: true,
            amount: true,
            currency: true,
            senderName: true,
            message: true,
            createdAt: true,
            isDeleted: true,
          },
        }),
      ]);

      return {
        total,
        limit,
        offset,
        transactions: items.map((tx) => ({
          id: String(tx.id),
          provider: tx.provider,
          type: tx.type,
          status: tx.status,
          isTest: tx.isTest,
          amount: tx.amount,
          currency: tx.currency,
          senderName: tx.senderName,
          message: tx.message,
          createdAt: tx.createdAt.toISOString(),
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
