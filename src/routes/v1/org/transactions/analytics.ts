import Elysia, { t } from "elysia";
import { sql } from "kysely";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { resolveOrgId } from "@/core/org";
import { hasAnyPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
import { orgParamsSchema, orgAnalyticsResponseSchema, standardOrgErrors } from "../schemas";

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

      const callerMember = await db
        .selectFrom("OrganizationMember")
        .select(["permissions"])
        .where("orgId", "=", Number(orgId))
        .where("userId", "=", Number(user.data.id))
        .executeTakeFirst();

      if (
        !callerMember ||
        !hasAnyPermission(
          BigInt(callerMember.permissions),
          OrgPerm.ORG_VIEW | OrgPerm.TRANSACTION_VIEW | OrgPerm.ANALYTICS_VIEW,
        )
      ) {
        set.status = "Forbidden";
        return "Insufficient permissions to view organization analytics";
      }

      const timeframe = (query.timeframe as "7d" | "30d" | "90d" | "1y") || "30d";
      const cacheKey = `org:${String(orgId)}:transactions:analytics:${timeframe}`;
      if (redis.redis.status === "ready") {
        const cached = await redis.redis.get(cacheKey).catch(() => null);
        if (cached) {
          try {
            return JSON.parse(cached) as OrgAnalyticsResponse;
          } catch {
            await redis.redis.del(cacheKey).catch(() => {});
          }
        }
      }

      const now = new Date();
      const daysCount = timeframe === "7d" ? 7 : timeframe === "90d" ? 90 : timeframe === "1y" ? 365 : 30;
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const startMs = todayUtc.getTime() - (daysCount - 1) * 86400000;
      const startDate = new Date(startMs);

      const [txRes, activeStreamersRow] = await Promise.all([
        sql<{
          createdAt: Date | string;
          isTest: number;
          streamerId: number | string;
          provider: string;
          currency: string;
          amount: number | string | bigint;
        }>`
          SELECT createdAt, isTest, streamerId, provider, currency, amount
          FROM TransactionLog
          WHERE orgId = ${Number(orgId)}
            AND createdAt >= ${startDate}
            AND status != 'FAILED'
            AND isDeleted IS NULL
        `.execute(db),
        db.selectFrom("Streamer")
          .select((eb) => eb.fn.count("id").as("count"))
          .where("orgId", "=", Number(orgId))
          .where("deletedAt", "is", null)
          .executeTakeFirst(),
      ]);

      const activeStreamersCount = Number(activeStreamersRow?.count ?? 0);

      const currencyMap = new Map<string, { amountMinor: bigint; count: number }>();
      const gatewayMap = new Map<string, { provider: string; currency: string; amountMinor: bigint; count: number }>();
      const streamerAggMap = new Map<string, { amountMinor: bigint; count: number }>();

      const bucketAmountMinor = new BigInt64Array(daysCount);
      const bucketCount = new Int32Array(daysCount);
      const bucketReal = new Int32Array(daysCount);
      const bucketTest = new Int32Array(daysCount);

      let totalTransactions = 0;
      let totalAmountMinor = 0n;
      let realTxTotal = 0;
      let testTxTotal = 0;

      for (const row of txRes.rows) {
        totalTransactions++;
        const isTest = Number(row.isTest) === 1;
        const rawAmt = typeof row.amount === "bigint" ? row.amount : BigInt(Math.round(Number(row.amount) || 0));
        const realAmt = isTest ? 0n : rawAmt;

        if (isTest) testTxTotal++;
        else {
          realTxTotal++;
          totalAmountMinor += realAmt;
        }

        const cur = row.currency || "THB";
        const cEntry = currencyMap.get(cur);
        if (cEntry) {
          cEntry.amountMinor += realAmt;
          cEntry.count += 1;
        } else {
          currencyMap.set(cur, { amountMinor: realAmt, count: 1 });
        }

        const gwKey = `${row.provider}\0${cur}`;
        const gEntry = gatewayMap.get(gwKey);
        if (gEntry) {
          gEntry.amountMinor += realAmt;
          gEntry.count += 1;
        } else {
          gatewayMap.set(gwKey, { provider: row.provider, currency: cur, amountMinor: realAmt, count: 1 });
        }

        const sKey = String(row.streamerId);
        const sEntry = streamerAggMap.get(sKey);
        if (sEntry) {
          sEntry.amountMinor += realAmt;
          sEntry.count += 1;
        } else {
          streamerAggMap.set(sKey, { amountMinor: realAmt, count: 1 });
        }

        const rowMs = row.createdAt instanceof Date ? row.createdAt.getTime() : new Date(row.createdAt).getTime();
        const dayIdx = Math.floor((rowMs - startMs) / 86400000);
        if (dayIdx >= 0 && dayIdx < daysCount) {
          bucketCount[dayIdx] += 1;
          if (isTest) {
            bucketTest[dayIdx] += 1;
          } else {
            bucketReal[dayIdx] += 1;
            bucketAmountMinor[dayIdx] += realAmt;
          }
        }
      }

      const totalAmountMinorNum = Number(totalAmountMinor);
      const totalAmount = totalAmountMinorNum / 100;

      const currencies = Array.from(currencyMap.entries())
        .sort((a, b) => (b[1].amountMinor > a[1].amountMinor ? 1 : b[1].amountMinor < a[1].amountMinor ? -1 : 0))
        .map(([currency, v]) => {
          const amtMinorNum = Number(v.amountMinor);
          return {
            currency,
            amount: amtMinorNum / 100,
            count: v.count,
            percentage: totalAmountMinorNum > 0 ? Math.round((amtMinorNum / totalAmountMinorNum) * 100) : 0,
          };
        });

      const primaryCurrency = currencies[0]?.currency || "THB";

      const gateways = Array.from(gatewayMap.values())
        .sort((a, b) => b.count - a.count)
        .map((g) => ({
          provider: g.provider,
          currency: g.currency,
          amount: Number(g.amountMinor) / 100,
          count: g.count,
          percentage: totalTransactions > 0 ? Math.round((g.count / totalTransactions) * 100) : 0,
        }));

      const topStreamers = Array.from(streamerAggMap.entries())
        .sort((a, b) => (b[1].amountMinor > a[1].amountMinor ? 1 : b[1].amountMinor < a[1].amountMinor ? -1 : 0))
        .slice(0, 10);

      const streamerIds = topStreamers.map(([id]) => Number(id));
      const streamerDetails = streamerIds.length
        ? await db
            .selectFrom("Streamer")
            .select(["id", "name", "displayName", "avatar"])
            .where("id", "in", streamerIds)
            .execute()
        : [];
      const streamerMap = new Map(streamerDetails.map((s) => [String(s.id), s]));

      const streamers = topStreamers.map(([id, agg]) => {
        const detail = streamerMap.get(id);
        const amtMinorNum = Number(agg.amountMinor);
        return {
          id,
          name: detail?.name || `streamer_${id}`,
          displayName: detail?.displayName || null,
          avatar: detail?.avatar || null,
          amount: amtMinorNum / 100,
          count: agg.count,
          percentage: totalAmountMinorNum > 0 ? Math.round((amtMinorNum / totalAmountMinorNum) * 100) : 0,
        };
      });

      const timeline: OrgAnalyticsResponse["timeline"] = new Array(daysCount);
      for (let i = 0; i < daysCount; i++) {
        timeline[i] = {
          date: new Date(startMs + i * 86400000).toISOString().slice(0, 10),
          amount: Number(bucketAmountMinor[i]) / 100,
          count: bucketCount[i],
          realCount: bucketReal[i],
          testCount: bucketTest[i],
        };
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

      if (redis.redis.status === "ready") {
        await redis.redis.setex(cacheKey, 60, JSON.stringify(response)).catch(() => {});
      }

      return response;
    },
    {
      params: orgParamsSchema,
      detail: {
        tags: ["Organization Transactions"],
        summary: "Get organization analytics and breakdown",
        description: "Returns revenue, currency distribution, payment gateway breakdown, and timeline. Excludes deleted transactions and separates test transactions from revenue.",
      },
      query: t.Object({
        timeframe: t.Optional(t.Union([t.Literal("7d"), t.Literal("30d"), t.Literal("90d"), t.Literal("1y")], { description: "Timeframe window (default: 30d)", examples: ["30d"] })),
      }),
      response: {
        200: orgAnalyticsResponseSchema,
        ...standardOrgErrors,
      },
    },
  );

export default endpoint;
