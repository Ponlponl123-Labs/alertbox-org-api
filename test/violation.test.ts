import { describe, it, expect, mock, beforeEach } from "bun:test";
import Elysia from "elysia";

let mockRows: Array<{ level: number; message: string; createdAt: Date | string }> = [];

mock.module("@/db", () => ({
  db: {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          where: () => ({
            orderBy: () => ({
              execute: async () => mockRows,
            }),
          }),
        }),
      }),
    }),
  },
}));

const { getTargetViolations } = await import("@/utils/violation");
const { ViolationTargetType } = await import("@/db/enums");
const { endpoint: MeViolationsEndpoint } = await import("@/routes/v1/me/violations");
const { endpoint: OrgViolationsEndpoint } = await import("@/routes/v1/org/violations");
const { endpoint: StreamerViolationsEndpoint } = await import("@/routes/v1/org/streamers/violations");

describe("Violations", () => {
  beforeEach(() => {
    mockRows = [];
  });

  it("returns level 0 and empty violate array when no violations exist", async () => {
    const res = await getTargetViolations(ViolationTargetType.USER, 1);
    expect(res).toEqual({ level: 0, violate: [] });
  });

  it("computes highest level and maps timestamp, message, level", async () => {
    mockRows = [
      { level: 1, message: "Minor warning", createdAt: new Date("2026-11-23T10:00:00.000Z") },
      { level: 3, message: "Severe TOS breach", createdAt: new Date("2026-11-22T08:30:00.000Z") },
      { level: 2, message: "Repeated spam", createdAt: "2026-11-21T12:00:00.000Z" },
    ];

    const res = await getTargetViolations(ViolationTargetType.ORG, 42);
    expect(res.level).toBe(3);
    expect(res.violate).toEqual([
      { timestamp: "2026-11-23T10:00:00.000Z", message: "Minor warning", level: 1 },
      { timestamp: "2026-11-22T08:30:00.000Z", message: "Severe TOS breach", level: 3 },
      { timestamp: "2026-11-21T12:00:00.000Z", message: "Repeated spam", level: 2 },
    ]);
  });

  it("enforces auth on me, org, and streamer violation endpoints", async () => {
    const app = new Elysia()
      .use(new Elysia({ prefix: "/me" }).use(MeViolationsEndpoint))
      .use(new Elysia({ prefix: "/org" }).use(OrgViolationsEndpoint).use(StreamerViolationsEndpoint));

    const paths = [
      "/me/violations",
      "/org/1/violations",
      "/org/1/streamers/1/violations",
    ];

    for (const path of paths) {
      const res = await app.handle(new Request(`http://localhost${path}`));
      expect(res.status).not.toBe(200);
    }
  });
});
