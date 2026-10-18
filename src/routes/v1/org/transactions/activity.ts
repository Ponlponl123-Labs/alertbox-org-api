import Elysia from "elysia";
import { sql } from "kysely";
import { auth } from "@/core/auth";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { resolveOrgId } from "@/core/org";
import { hasAnyPermission } from "@/utils/rbac";
import { OrgPerm } from "@/consts/permission";
import type { OrgActivityResponse, OrgActivityDay } from "@/types";

export const endpoint = new Elysia()
  .use(auth)
  .get(
    "/:orgId/transactions/activity",
    async ({ getAuthenticatedUser, params, set }): Promise<OrgActivityResponse | string> => {
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
        return "Insufficient permissions to view organization transaction activity";
      }

      const cacheKey = `org:${String(orgId)}:transactions:activity`;
      const cached = await redis.redis.get(cacheKey);
      if (cached) {
        try {
          return JSON.parse(cached) as OrgActivityResponse;
        } catch {
          await redis.redis.del(cacheKey);
        }
      }

      const now = new Date();
      const totalDays = 52 * 7;
      const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      const startDate = new Date(todayUtc.getTime() - (totalDays - 1) * 86400000);

      const { rows } = await sql<
        { day: string; count: number | string; testCount: number | string; realCount: number | string }
      >`
        SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') as day,
               COUNT(*) as count,
               CAST(SUM(CASE WHEN isTest = 1 THEN 1 ELSE 0 END) AS UNSIGNED) as testCount,
               CAST(SUM(CASE WHEN isTest = 0 THEN 1 ELSE 0 END) AS UNSIGNED) as realCount
        FROM TransactionLog FORCE INDEX (TransactionLog_orgId_createdAt_idx)
        WHERE orgId = ${Number(orgId)}
          AND createdAt >= ${startDate}
          AND status != 'FAILED'
        GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')
      `.execute(db);

      const countMap = new Map<string, { total: number; test: number; real: number }>();
      for (const row of rows) {
        countMap.set(row.day, {
          total: Number(row.count),
          test: Number(row.testCount || 0),
          real: Number(row.realCount || 0),
        });
      }

      const days: OrgActivityDay[] = [];
      let totalCount = 0;
      let totalRealCount = 0;
      let totalTestCount = 0;
      let maxCount = 0;
      let busiestDay: OrgActivityDay | null = null;
      let longestStreak = 0;
      let tempStreak = 0;
      let longestStreakStart = "";
      let longestStreakEnd = "";
      let tempStreakStart = "";

      for (let i = 0; i < totalDays; i++) {
        const d = new Date(startDate.getTime() + i * 86400000);
        const dateStr = d.toISOString().slice(0, 10);
        const counts = countMap.get(dateStr) || { total: 0, test: 0, real: 0 };
        const count = counts.total;
        const testCount = counts.test;
        const realCount = counts.real;

        totalCount += count;
        totalRealCount += realCount;
        totalTestCount += testCount;

        if (count > maxCount) {
          maxCount = count;
          busiestDay = { date: dateStr, count, testCount, realCount };
        }

        if (count > 0) {
          if (tempStreak === 0) tempStreakStart = dateStr;
          tempStreak++;
          if (tempStreak > longestStreak) {
            longestStreak = tempStreak;
            longestStreakStart = tempStreakStart;
            longestStreakEnd = dateStr;
          }
        } else {
          tempStreak = 0;
        }

        days.push({ date: dateStr, count, testCount, realCount });
      }

      let currentStreak = 0;
      let currentStreakStart = "";
      let currentStreakEnd = "";
      for (let i = totalDays - 1; i >= 0; i--) {
        if (days[i].count > 0) {
          if (currentStreak === 0) currentStreakEnd = days[i].date;
          currentStreak++;
          currentStreakStart = days[i].date;
        } else {
          break;
        }
      }

      const response: OrgActivityResponse = {
        days,
        totalCount,
        totalRealCount,
        totalTestCount,
        maxCount,
        busiestDay,
        longestStreak,
        longestStreakRange:
          longestStreak > 0 ? { start: longestStreakStart, end: longestStreakEnd } : null,
        currentStreak,
        currentStreakRange:
          currentStreak > 0 ? { start: currentStreakStart, end: currentStreakEnd } : null,
        startDate: days[0].date,
        endDate: days[days.length - 1].date,
      };

      await redis.redis.setex(cacheKey, 300, JSON.stringify(response));

      return response;
    },
    {
      detail: {
        tags: ["Organizations"],
        summary: "Get organization 365-day transaction activity",
        description:
          "Returns aggregated daily transaction volume for all streamer channels across the organization.",
      },
    },
  );

/**
 * Write-through cache override: updates the in-memory Redis activity dataset
 * in real-time when new transactions are received, avoiding cache busts and SQL re-queries.
 */
export async function recordActivityTransaction(
  orgId: bigint | string,
  isTest: boolean,
  delta = 1,
): Promise<void> {
  const cacheKey = `org:${String(orgId)}:transactions:activity`;
  const cached = await redis.redis.get(cacheKey);
  if (!cached) return;

  try {
    const data: OrgActivityResponse = JSON.parse(cached);
    if (!data || !Array.isArray(data.days) || data.days.length === 0) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const targetDay = data.days.find((d) => d.date === todayStr) || data.days[data.days.length - 1];

    if (targetDay) {
      targetDay.count = (targetDay.count || 0) + delta;
      if (isTest) {
        targetDay.testCount = (targetDay.testCount || 0) + delta;
      } else {
        targetDay.realCount = (targetDay.realCount || 0) + delta;
      }
    }

    data.totalCount = (data.totalCount || 0) + delta;
    if (isTest) {
      data.totalTestCount = (data.totalTestCount || 0) + delta;
    } else {
      data.totalRealCount = (data.totalRealCount || 0) + delta;
    }

    if (targetDay && targetDay.count > (data.maxCount || 0)) {
      data.maxCount = targetDay.count;
      data.busiestDay = {
        date: targetDay.date,
        count: targetDay.count,
        testCount: targetDay.testCount,
        realCount: targetDay.realCount,
      };
    }

    if (targetDay && targetDay.count > 0 && data.currentStreak === 0) {
      data.currentStreak = 1;
      data.currentStreakRange = { start: targetDay.date, end: targetDay.date };
    }

    await redis.redis.setex(cacheKey, 300, JSON.stringify(data));
  } catch {}
}

export default endpoint;
