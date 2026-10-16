import Elysia, { t } from "elysia";
import { auth } from "@/core/auth";
import { prisma } from "@/core/prisma";
import { redis } from "@/core/redis";
import { resolveOrgId } from "@/core/org";
import { hasAnyPermission, OrgPerm } from "@/utils/rbac";

export type OrgAnalyticsResponse = {
  timeframe: string;
  totals: {
    revenue: number;
    currency: string;
    transactions: number;
    realTransactions: number;
    testTransactions: number;
    activeGateways: number;
    activeStreamers: number;
  };
  currencies: Array<{
    currency: string;
    amount: number;
    count: number;
    percentage: number;
  }>;
  gateways: Array<{
    provider: string;
    amount: number;
    count: number;
    currency: string;
    percentage: number;
  }>;
  streamers: Array<{
    id: string;
    name: string;
    displayName: string | null;
    avatar: string | null;
    amount: number;
    count: number;
    percentage: number;
  }>;
  timeline: Array<{
    date: string;
    amount: number;
    count: number;
    realCount: number;
    testCount: number;
  }>;
};

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/transactions/analytics",
    async ({ getAuthenticatedUser, params, query, set }): Promise<OrgAnalyticsResponse | string> => {
      const user = await getAuthenticatedUser();
      const orgId = await resolveOrgId(params.orgId);
      if (!orgId) {
        set.status = "Bad Request";
        return "Invalid organization ID";
      }

      const callerMember = await prisma.client.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: user.data.id } },
      });

      if (
        !callerMember ||
        !hasAnyPermission(
          callerMember.permissions,
          OrgPerm.ORG_VIEW | OrgPerm.TRANSACTION_VIEW | OrgPerm.ANALYTICS_VIEW,
        )
      ) {
        set.status = "Forbidden";
        return "Insufficient permissions to view organization analytics";
      }

      const timeframe = (query.timeframe as "7d" | "30d" | "90d" | "1y") || "30d";
      const cacheKey = `org:${String(orgId)}:transactions:analytics:${timeframe}`;
      const cached = await redis.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as OrgAnalyticsResponse;
        } catch {
          await redis.redis.del(cacheKey);
        }
      }

      const now = new Date();
      const daysCount = timeframe === "7d" ? 7 : timeframe === "90d" ? 90 : timeframe === "1y" ? 365 : 30;
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const startDate = new Date(todayUtc.getTime() - (daysCount - 1) * 86400000);

      const [currencyRows, gatewayRows, streamerRows, timelineRows, activeStreamersCount] = await Promise.all([
        prisma.client.$queryRaw<Array<{ currency: string; amount: number | bigint; count: number | bigint }>>`
          SELECT currency,
                 CAST(SUM(amount) AS UNSIGNED) as amount,
                 COUNT(*) as count
          FROM TransactionLog
          WHERE orgId = ${orgId}
            AND status != 'FAILED'
            AND createdAt >= ${startDate}
          GROUP BY currency
          ORDER BY amount DESC
        `,
        prisma.client.$queryRaw<Array<{ provider: string; currency: string; amount: number | bigint; count: number | bigint }>>`
          SELECT provider,
                 currency,
                 CAST(SUM(amount) AS UNSIGNED) as amount,
                 COUNT(*) as count
          FROM TransactionLog
          WHERE orgId = ${orgId}
            AND status != 'FAILED'
            AND createdAt >= ${startDate}
          GROUP BY provider, currency
          ORDER BY count DESC
        `,
        prisma.client.$queryRaw<Array<{ streamerId: bigint; amount: number | bigint; count: number | bigint }>>`
          SELECT streamerId,
                 CAST(SUM(amount) AS UNSIGNED) as amount,
                 COUNT(*) as count
          FROM TransactionLog
          WHERE orgId = ${orgId}
            AND status != 'FAILED'
            AND createdAt >= ${startDate}
          GROUP BY streamerId
          ORDER BY amount DESC
          LIMIT 10
        `,
        prisma.client.$queryRaw<Array<{ date: string; amount: number | bigint; count: number | bigint; realCount: number | bigint; testCount: number | bigint }>>`
          SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') as date,
                 CAST(SUM(amount) AS UNSIGNED) as amount,
                 COUNT(*) as count,
                 CAST(SUM(CASE WHEN isTest = 1 THEN 1 ELSE 0 END) AS UNSIGNED) as testCount,
                 CAST(SUM(CASE WHEN isTest = 0 THEN 1 ELSE 0 END) AS UNSIGNED) as realCount
          FROM TransactionLog
          WHERE orgId = ${orgId}
            AND status != 'FAILED'
            AND createdAt >= ${startDate}
          GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')
          ORDER BY date ASC
        `,
        prisma.client.streamer.count({
          where: { orgId, deletedAt: null },
        }),
      ]);

      const totalTransactions = currencyRows.reduce((acc, r) => acc + Number(r.count), 0);
      const totalAmountCents = currencyRows.reduce((acc, r) => acc + Number(r.amount), 0);
      const totalAmount = totalAmountCents / 100;
      const primaryCurrency = currencyRows[0]?.currency || "THB";

      const currencies = currencyRows.map((r) => ({
        currency: r.currency,
        amount: Number(r.amount) / 100,
        count: Number(r.count),
        percentage: totalAmountCents > 0 ? Math.round((Number(r.amount) / totalAmountCents) * 100) : 0,
      }));

      const totalGatewayVolume = gatewayRows.reduce((acc, r) => acc + Number(r.count), 0);
      const gateways = gatewayRows.map((r) => ({
        provider: r.provider,
        currency: r.currency,
        amount: Number(r.amount) / 100,
        count: Number(r.count),
        percentage: totalGatewayVolume > 0 ? Math.round((Number(r.count) / totalGatewayVolume) * 100) : 0,
      }));

      const streamerIds = streamerRows.map((r) => r.streamerId);
      const streamerDetails = streamerIds.length
        ? await prisma.client.streamer.findMany({
            where: { id: { in: streamerIds } },
            select: { id: true, name: true, displayName: true, avatar: true },
          })
        : [];
      const streamerMap = new Map(streamerDetails.map((s) => [String(s.id), s]));

      const streamers = streamerRows.map((r) => {
        const detail = streamerMap.get(String(r.streamerId));
        return {
          id: String(r.streamerId),
          name: detail?.name || `streamer_${r.streamerId}`,
          displayName: detail?.displayName || null,
          avatar: detail?.avatar || null,
          amount: Number(r.amount) / 100,
          count: Number(r.count),
          percentage: totalAmountCents > 0 ? Math.round((Number(r.amount) / totalAmountCents) * 100) : 0,
        };
      });

      const timelineMap = new Map(
        timelineRows.map((r) => [
          r.date,
          {
            amount: Number(r.amount) / 100,
            count: Number(r.count),
            realCount: Number(r.realCount || 0),
            testCount: Number(r.testCount || 0),
          },
        ]),
      );

      const timeline: OrgAnalyticsResponse["timeline"] = [];
      let cur = new Date(startDate);
      let realTxTotal = 0;
      let testTxTotal = 0;

      while (cur <= todayUtc) {
        const dateStr = cur.toISOString().slice(0, 10);
        const entry = timelineMap.get(dateStr);
        const count = entry?.count || 0;
        const real = entry?.realCount || 0;
        const test = entry?.testCount || 0;
        realTxTotal += real;
        testTxTotal += test;

        timeline.push({
          date: dateStr,
          amount: entry?.amount || 0,
          count,
          realCount: real,
          testCount: test,
        });

        cur = new Date(cur.getTime() + 86400000);
      }

      const response: OrgAnalyticsResponse = {
        timeframe,
        totals: {
          revenue: totalAmount,
          currency: primaryCurrency,
          transactions: totalTransactions,
          realTransactions: realTxTotal,
          testTransactions: testTxTotal,
          activeGateways: gateways.length,
          activeStreamers: activeStreamersCount,
        },
        currencies,
        gateways,
        streamers,
        timeline,
      };

      await redis.redis.setex(cacheKey, 60, JSON.stringify(response));

      return response;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get organization analytics and breakdown",
        description: "Returns revenue, currency distribution, payment gateway breakdown, and timeline.",
      },
      query: t.Object({
        timeframe: t.Optional(t.Union([t.Literal("7d"), t.Literal("30d"), t.Literal("90d"), t.Literal("1y")])),
      }),
    },
  );

export default endpoint;
