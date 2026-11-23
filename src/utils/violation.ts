import { t } from "elysia";
import { sql } from "kysely";
import { db } from "@/db";
import { redis } from "@/core/redis";
import { ViolationTargetType } from "@/db/enums";
import type { ViolationResponse } from "@/types";

export const violationResponseSchema = t.Object({
  level: t.Number({
    description: "Highest violation level for the target (0 if none)",
    examples: [2],
  }),
  violate: t.Array(
    t.Object({
      timestamp: t.String({
        description: "ISO-8601 timestamp when violation was recorded",
        examples: ["2026-11-23T12:00:00.000Z"],
      }),
      message: t.String({
        description: "Violation reason/message",
        examples: ["Terms of service violation"],
      }),
      level: t.Number({
        description: "Integer severity level of this violation",
        examples: [2],
      }),
    }),
  ),
});

export async function getTargetViolations(
  targetType: ViolationTargetType,
  targetId: bigint | number,
): Promise<ViolationResponse> {
  const rows = await db
    .selectFrom("Violation")
    .select(["level", "message", "createdAt"])
    .where("targetType", "=", targetType)
    .where("targetId", "=", Number(targetId))
    .orderBy("createdAt", "desc")
    .execute();

  let highestLevel = 0;
  const violate = rows.map((row) => {
    const level = Number(row.level);
    if (level > highestLevel) highestLevel = level;
    const timestamp =
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : new Date(row.createdAt).toISOString();
    return {
      timestamp,
      message: row.message,
      level,
    };
  });

  return {
    level: highestLevel,
    violate,
  };
}

export async function recordViolation(
  targetType: ViolationTargetType,
  targetId: bigint | number,
  level: number,
  message: string,
): Promise<void> {
  const numId = Number(targetId);

  await db.transaction().execute(async (trx) => {
    await trx
      .insertInto("Violation")
      .values({
        targetType,
        targetId: numId,
        level,
        message,
      })
      .execute();

    const table =
      targetType === ViolationTargetType.USER
        ? "User"
        : targetType === ViolationTargetType.ORG
          ? "Organization"
          : "Streamer";

    await trx
      .updateTable(table)
      .set({ violationLevel: sql`GREATEST(violationLevel, ${level})` })
      .where("id", "=", numId)
      .execute();
  });

  if (targetType === ViolationTargetType.USER) {
    await redis.redis.del(`user:${String(targetId)}:info`).catch(() => {});
  } else if (targetType === ViolationTargetType.ORG) {
    await redis.redis.del(`org:${String(targetId)}:info`).catch(() => {});
  }
}
