import { describe, expect, it, beforeEach } from "bun:test";
import { redis } from "../src/core/redis";
import {
  updateOrgCache,
  updateStreamerCache,
  updateMemberCache,
  updateWidgetSettingsCache,
} from "../src/utils/cache-sync";

describe("Seamless Redis Write-Through & In-Place Cache Synchronization", () => {
  const mockStore = new Map<string, string>();
  const deletedKeys: string[] = [];

  beforeEach(() => {
    mockStore.clear();
    deletedKeys.length = 0;
    const hashMap = new Map<string, Map<string, string>>();
    (redis.redis as any).get = async (key: string) => mockStore.get(key) ?? null;
    (redis.redis as any).setex = async (key: string, _ttl: number, val: string) => {
      mockStore.set(key, val);
      return "OK";
    };
    (redis.redis as any).hget = async (key: string, field: string) => hashMap.get(key)?.get(field) ?? null;
    (redis.redis as any).hset = async (key: string, ...args: any[]) => {
      let m = hashMap.get(key);
      if (!m) {
        m = new Map();
        hashMap.set(key, m);
      }
      if (typeof args[0] === "object") {
        for (const [k, v] of Object.entries(args[0])) m.set(k, String(v));
      } else {
        m.set(args[0], String(args[1]));
      }
      return 1;
    };
    (redis.redis as any).hvals = async (key: string) => Array.from(hashMap.get(key)?.values() ?? []);
    (redis.redis as any).del = async (key: string) => {
      deletedKeys.push(key);
      mockStore.delete(key);
      hashMap.delete(key);
      return 1;
    };
  });

  it("updateOrgCache: overwrites org info and updates member org_list in-place with zero deletions", async () => {
    const orgId = "10";
    const userId = "100";

    // Seed existing cached org_list
    mockStore.set(
      `user:${userId}:org_list`,
      JSON.stringify([
        { id: "10", name: "Old Org Name", slug: "old-org", avatar: null, banner: null },
      ]),
    );

    await updateOrgCache(
      { id: orgId, name: "Renamed Org", avatar: "https://avatar.png", slug: "renamed-org" },
      [userId],
    );

    // No keys deleted!
    expect(deletedKeys.length).toBe(0);

    // Centralized org:info is written
    const orgInfo = JSON.parse(mockStore.get(`org:${orgId}:info`)!);
    expect(orgInfo.name).toBe("Renamed Org");
    expect(orgInfo.avatar).toBe("https://avatar.png");

    // Member org_list is updated in-place seamlessly
    const updatedList = JSON.parse(mockStore.get(`user:${userId}:org_list`)!);
    expect(updatedList[0].name).toBe("Renamed Org");
    expect(updatedList[0].avatar).toBe("https://avatar.png");
  });

  it("updateStreamerCache: updates streamer info and parent org:streamers array in-place with zero deletions", async () => {
    const streamerId = "50";
    const orgId = "10";
    const userId = "100";

    mockStore.set(
      `streamer:${streamerId}:info`,
      JSON.stringify({ id: streamerId, name: "OldStreamer", displayName: "Old" }),
    );

    await (redis.redis as any).hset(
      `org:${orgId}:streamers`,
      streamerId,
      JSON.stringify({ id: streamerId, name: "OldStreamer", displayName: "Old" }),
    );

    mockStore.set(
      `user:${userId}:org_list`,
      JSON.stringify([
        {
          id: orgId,
          streamers: [{ id: streamerId, name: "OldStreamer", displayName: "Old" }],
        },
      ]),
    );

    await updateStreamerCache(
      {
        id: streamerId,
        orgId,
        name: "NewStreamer",
        displayName: "New Display",
        avatar: "https://avatar.webp",
      },
      [userId],
    );

    expect(deletedKeys.length).toBe(0);

    const streamerInfo = JSON.parse(mockStore.get(`streamer:${streamerId}:info`)!);
    expect(streamerInfo.name).toBe("NewStreamer");
    expect(streamerInfo.displayName).toBe("New Display");

    const orgStreamer = JSON.parse(await (redis.redis as any).hget(`org:${orgId}:streamers`, streamerId)!);
    expect(orgStreamer.name).toBe("NewStreamer");
    expect(orgStreamer.displayName).toBe("New Display");

    const userOrgs = JSON.parse(mockStore.get(`user:${userId}:org_list`)!);
    expect(userOrgs[0].streamers[0].name).toBe("NewStreamer");
  });

  it("updateMemberCache: updates org:members and member org_list role/permissions in-place", async () => {
    const orgId = "10";
    const memberId = "20";
    const userId = "100";

    mockStore.set(
      `org:${orgId}:members`,
      JSON.stringify([{ id: memberId, role: "MEMBER", permissions: "1" }]),
    );

    mockStore.set(
      `user:${userId}:org_list`,
      JSON.stringify([{ id: orgId, role: "MEMBER", permissions: "1" }]),
    );

    await updateMemberCache(orgId, memberId, userId, {
      role: "ADMIN",
      permissions: "511",
    });

    expect(deletedKeys.length).toBe(0);

    const members = JSON.parse(mockStore.get(`org:${orgId}:members`)!);
    expect(members[0].role).toBe("ADMIN");
    expect(members[0].permissions).toBe("511");

    const userOrgs = JSON.parse(mockStore.get(`user:${userId}:org_list`)!);
    expect(userOrgs[0].role).toBe("ADMIN");
    expect(userOrgs[0].permissions).toBe("511");
  });

  it("updateWidgetSettingsCache: directly overrides widget token settings cache", async () => {
    const token = "widget_token_abc";
    await updateWidgetSettingsCache("123", token, { alertsEnabled: true });

    expect(deletedKeys.length).toBe(0);
    const cached = JSON.parse(mockStore.get(`widget:settings:token:${token}`)!);
    expect(cached.widgetId).toBe("123");
    expect(cached.alertbox.alertsEnabled).toBe(true);
  });
});
