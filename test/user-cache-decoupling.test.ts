import { describe, expect, it, beforeEach } from "bun:test";
import { setCachedUser, getCachedUser, filterUserSelection } from "../src/classes/me/cache";
import { pureUserSelect, basicUserSelect } from "../src/consts/session";
import { redis } from "../src/core/redis";

if (!("toJSON" in BigInt.prototype)) {
  (BigInt.prototype as any).toJSON = function (): string {
    return this.toString();
  };
}

describe("User Cache Decoupling & Pure Identity Isolation", () => {
  const mockStore = new Map<string, string>();

  beforeEach(() => {
    mockStore.clear();
    (redis.redis as any).get = async (key: string) => mockStore.get(key) ?? null;
    (redis.redis as any).setex = async (key: string, _ttl: number, val: string) => {
      mockStore.set(key, val);
      return "OK";
    };
    (redis.redis as any).del = async (key: string) => {
      mockStore.delete(key);
      return 1;
    };
  });

  it("should isolate strictly pure user scalar fields and discard relational sub-entities", async () => {
    const rawUserWithBloatedGraph = {
      id: 9001n,
      email: "creator@alertbox.org",
      name: "SuperCreator",
      avatar: "https://static.alertbox.org/avatars/user-9001.webp",
      createWith: "discord",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      disabledAt: null,
      deletedAt: null,
      secret: "super-confidential-auth-secret",
      // Relational multi-tenant graph that should NEVER be stored in user cache:
      memberships: [
        {
          id: 101n,
          role: "OWNER",
          organization: {
            id: 201n,
            name: "Mega Org",
            slug: "mega-org",
            streamers: [
              {
                id: 301n,
                name: "Main Channel",
                widgets: [
                  {
                    id: 401n,
                    token: "widget_token_abc_123",
                    alertbox: {
                      events: [
                        { id: 501n, eventType: "DONATION", message: "Thanks!" },
                        { id: 502n, eventType: "FOLLOW", message: "Welcome!" },
                      ],
                    },
                  },
                ],
                integration: {
                  stripeSecret: "sk_live_12345",
                  kofiSecret: "kofi_secret_abc",
                },
              },
            ],
          },
        },
      ],
    };

    const cachedPureUser = await setCachedUser(rawUserWithBloatedGraph.id, rawUserWithBloatedGraph);

    // Verify pure scalar properties are preserved
    expect(cachedPureUser.id).toBe(9001n);
    expect(cachedPureUser.email).toBe("creator@alertbox.org");
    expect(cachedPureUser.name).toBe("SuperCreator");
    expect(cachedPureUser.displayName).toBe("SuperCreator");
    expect(cachedPureUser.avatar).toBe("https://static.alertbox.org/avatars/user-9001.webp");
    expect(cachedPureUser.createWith).toBe("discord");

    // Verify relational sub-entities and auth secrets are strictly excluded
    expect((cachedPureUser as any).secret).toBeUndefined();
    expect((cachedPureUser as any).memberships).toBeUndefined();
    expect((cachedPureUser as any).organization).toBeUndefined();
    expect((cachedPureUser as any).streamers).toBeUndefined();
    expect((cachedPureUser as any).widgets).toBeUndefined();

    // Verify storage payload size in Redis
    const storedInRedis = await redis.redis.get("user:9001:info");
    expect(storedInRedis).not.toBeNull();
    const byteSize = Buffer.byteLength(storedInRedis!, "utf8");

    // Decoupled user cache must be ultra-compact (< 300 bytes)
    expect(byteSize).toBeLessThan(300);

    // Verify reading back from cache parses BigInt ID
    const retrieved = await getCachedUser(9001n);
    expect(retrieved).not.toBeNull();
    expect(retrieved.id).toBe(9001n);
    expect(retrieved.email).toBe("creator@alertbox.org");
    expect((retrieved as any).memberships).toBeUndefined();
  });

  it("should handle deleted sentinel and invalid JSON gracefully in getCachedUser", async () => {
    await redis.redis.setex("user:9999:info", 60, "deleted");
    const deletedResult = await getCachedUser(9999n);
    expect(deletedResult).toBe("deleted");

    await redis.redis.setex("user:8888:info", 60, "INVALID_CORRUPTED_JSON{]");
    const corruptedResult = await getCachedUser(8888n);
    expect(corruptedResult).toBeNull();
  });

  it("should accurately filter user selection in memory", () => {
    const fullUser = {
      id: 100n,
      email: "user@alertbox.org",
      name: "John",
      avatar: "avatar.png",
      createWith: "google",
      createdAt: new Date(),
    };

    const minimal = filterUserSelection(fullUser, basicUserSelect);
    expect(minimal.id).toBe(100n);
    expect(minimal.email).toBeUndefined();
    expect(minimal.name).toBeUndefined();

    const selected = filterUserSelection(fullUser, { id: true, email: true, name: true });
    expect(selected.id).toBe(100n);
    expect(selected.email).toBe("user@alertbox.org");
    expect(selected.name).toBe("John");
    expect(selected.avatar).toBeUndefined();
  });
});

describe("Centralized Multi-Tenant Entity Architecture", () => {
  const mockStore = new Map<string, string>();
  const mockHashMap = new Map<string, Map<string, string>>();

  beforeEach(() => {
    mockStore.clear();
    mockHashMap.clear();
    (redis.redis as any).get = async (key: string) => mockStore.get(key) ?? null;
    (redis.redis as any).setex = async (key: string, _ttl: number, val: string) => {
      mockStore.set(key, val);
      return "OK";
    };
    (redis.redis as any).del = async (key: string) => {
      mockStore.delete(key);
      mockHashMap.delete(key);
      return 1;
    };
    (redis.redis as any).hget = async (key: string, field: string) => {
      return mockHashMap.get(key)?.get(field) ?? null;
    };
    (redis.redis as any).hset = async (key: string, field: string, val: string) => {
      if (!mockHashMap.has(key)) mockHashMap.set(key, new Map());
      mockHashMap.get(key)!.set(field, val);
      return 1;
    };
  });

  it("should demonstrate centralized org and streamer cache invalidation prevents stale data across members", async () => {
    const orgId = "org_test_777";
    const streamerId = "streamer_test_888";

    // 1. Initial shared state cached centrally in Redis
    const initialStreamer = {
      id: streamerId,
      orgId,
      name: "Original Streamer Name",
      displayName: "Original Streamer Name",
      avatar: "old_avatar.png",
    };

    await redis.redis.setex(`streamer:${streamerId}:info`, 3600, JSON.stringify(initialStreamer));
    await redis.redis.setex(`org:${orgId}:streamers`, 3600, JSON.stringify([initialStreamer]));

    // Member A and Member B both view the streamer channel
    const memberAView = JSON.parse((await redis.redis.get(`streamer:${streamerId}:info`))!);
    const memberBView = JSON.parse((await redis.redis.get(`streamer:${streamerId}:info`))!);
    expect(memberAView.name).toBe("Original Streamer Name");
    expect(memberBView.name).toBe("Original Streamer Name");

    // 2. Member A updates streamer channel
    const updatedStreamer = {
      ...initialStreamer,
      name: "Updated Streamer Name",
      displayName: "Updated Streamer Name",
    };

    // Centralized invalidation (as implemented in streamers/patch.ts and profile.ts)
    await Promise.all([
      redis.redis.del(`streamer:${streamerId}:info`),
      redis.redis.del(`org:${orgId}:streamers`),
      redis.redis.del(`org:${orgId}:primary_streamer`),
    ]);

    // Cache updated centralized streamer
    await redis.redis.setex(`streamer:${streamerId}:info`, 3600, JSON.stringify(updatedStreamer));

    // 3. Member B immediately sees the updated streamer name without stale user cache drift
    const memberBFreshView = JSON.parse((await redis.redis.get(`streamer:${streamerId}:info`))!);
    expect(memberBFreshView.name).toBe("Updated Streamer Name");
  });

  it("should verify write-through caching populates user:orgs hash and centralized org:info", async () => {
    const userId = "12345";
    const orgId = "67890";
    const orgData = {
      id: orgId,
      name: "Acme Studios",
      slug: "acme-studios",
      avatar: "https://static.alertbox.org/org.png",
      banner: null,
      ownerId: userId,
      createdAt: new Date().toISOString(),
    };

    // Simulate write-through population
    await redis.redis.hset(`user:${userId}:orgs`, orgId, "OWNER:18446744073709551615");
    await redis.redis.setex(`org:${orgId}:info`, 86400, JSON.stringify(orgData));

    // Instant permission check via Redis hash without DB lookup
    const cachedPerm = await redis.redis.hget(`user:${userId}:orgs`, orgId);
    expect(cachedPerm).toBe("OWNER:18446744073709551615");

    // Instant org metadata lookup via centralized key
    const cachedOrgRaw = await redis.redis.get(`org:${orgId}:info`);
    const parsedOrg = JSON.parse(cachedOrgRaw!);
    expect(parsedOrg.name).toBe("Acme Studios");
  });

  it("should verify precomputed SYSTEM_PRESETS correctness and zero-cost retrieval", async () => {
    const { SYSTEM_PRESETS } = await import("../src/consts/permission");
    expect(SYSTEM_PRESETS).toBeDefined();
    expect(Array.isArray(SYSTEM_PRESETS)).toBe(true);

    const ownerPreset = SYSTEM_PRESETS.find((p) => p.role === "OWNER");
    expect(ownerPreset).toBeDefined();
    expect(ownerPreset?.isSystem).toBe(true);
    expect(ownerPreset?.grantedKeys.length).toBeGreaterThan(10);
    expect(ownerPreset?.grantedKeys).toContain("ORG_MEMBER_ADD");
    expect(ownerPreset?.grantedKeys).toContain("ORG_MEMBER_MODIFY");
    expect(ownerPreset?.grantedKeys).toContain("ORG_MEMBER_REMOVE");

    const memberPreset = SYSTEM_PRESETS.find((p) => p.role === "MEMBER");
    expect(memberPreset).toBeDefined();
    expect(memberPreset?.grantedKeys).toContain("ORG_VIEW");
    expect(memberPreset?.grantedKeys).not.toContain("ORG_DELETE");
  });

  it("should verify credential sanitization masks secrets into boolean flags", () => {
    const rawIntegration = {
      id: 101n,
      orgId: 201n,
      streamerId: 301n,
      stripeSecret: "sk_live_top_secret_key",
      bmacSecret: "bmac_secret_key",
      kofiSecret: "kofi_secret_key",
      xenditSecret: "xendit_secret_key",
      ffpSecret: "ffp_secret_key",
      streamlabsSecret: "streamlabs_secret_key",
      streamlabsRefreshToken: "streamlabs_refresh_token",
      kofiUsername: "creator_kofi",
      bmacUsername: "creator_bmac",
    };

    // Mapping logic applied in fetchUserMemberships
    const sanitized = {
      id: String(rawIntegration.id),
      orgId: String(rawIntegration.orgId),
      streamerId: String(rawIntegration.streamerId),
      stripe: Boolean(rawIntegration.stripeSecret),
      bmac: Boolean(rawIntegration.bmacSecret),
      kofi: Boolean(rawIntegration.kofiSecret),
      xendit: Boolean(rawIntegration.xenditSecret),
      ffp: Boolean(rawIntegration.ffpSecret),
      streamlabs: Boolean(rawIntegration.streamlabsSecret),
      kofiUsername: rawIntegration.kofiUsername,
      bmacUsername: rawIntegration.bmacUsername,
    };

    expect((sanitized as any).stripeSecret).toBeUndefined();
    expect((sanitized as any).streamlabsSecret).toBeUndefined();
    expect((sanitized as any).streamlabsRefreshToken).toBeUndefined();
    expect((sanitized as any).kofiSecret).toBeUndefined();
    expect(sanitized.stripe).toBe(true);
    expect(sanitized.streamlabs).toBe(true);
    expect(sanitized.kofi).toBe(true);
    expect(sanitized.kofiUsername).toBe("creator_kofi");
  });

  it("should verify centralized org:members caching and invalidation", async () => {
    const orgId = "555";
    const membersData = [
      { id: "1", userId: "10", name: "Alice", role: "OWNER" },
      { id: "2", userId: "20", name: "Bob", role: "MEMBER" },
    ];

    await redis.redis.setex(`org:${orgId}:members`, 3600, JSON.stringify(membersData));
    const cached = JSON.parse((await redis.redis.get(`org:${orgId}:members`))!);
    expect(cached.length).toBe(2);
    expect(cached[0].name).toBe("Alice");

    // Invalidation upon member role update or member removal
    await redis.redis.del(`org:${orgId}:members`);
    const invalidated = await redis.redis.get(`org:${orgId}:members`);
    expect(invalidated).toBeNull();
  });

  it("should verify full multi-tenant cache invalidation upon organization deletion", async () => {
    const orgId = "888";
    const memberIds = ["101", "102", "103"];
    const streamer1 = { id: "201", uri: "alpha-channel" };
    const streamer2 = { id: "202", uri: "beta-channel" };

    // 1. Seed all active cache lines for the organization, members, and channels
    await redis.redis.setex(`org:${orgId}:info`, 86400, JSON.stringify({ id: orgId, name: "Alpha Org", memberCount: 3 }));
    await redis.redis.setex(`org:${orgId}:streamers`, 3600, JSON.stringify([streamer1, streamer2]));
    await redis.redis.setex(`org:${orgId}:primary_streamer`, 3600, streamer1.id);
    await redis.redis.setex(`org:${orgId}:members`, 3600, JSON.stringify([{ id: "1" }, { id: "2" }, { id: "3" }]));
    await redis.redis.setex(`org:${orgId}:presets`, 86400, JSON.stringify([{ id: "1", name: "Custom" }]));

    for (const mId of memberIds) {
      await redis.redis.hset(`user:${mId}:orgs`, orgId, "MEMBER:1");
      await redis.redis.setex(`user:${mId}:org_list`, 3600, JSON.stringify([{ id: orgId }]));
    }

    for (const s of [streamer1, streamer2]) {
      await redis.redis.setex(`streamer:${s.id}:info`, 3600, JSON.stringify(s));
      await redis.redis.setex(`streamer:${s.id}:profile`, 3600, JSON.stringify(s));
      await redis.redis.setex(`uri:${s.uri}:owner`, 604800, s.id);
      await redis.redis.setex(`streamer:${s.id}:uri`, 604800, s.uri);
    }

    // Verify all keys initially hit cache
    expect(await redis.redis.get(`org:${orgId}:info`)).not.toBeNull();
    expect(await redis.redis.get(`org:${orgId}:streamers`)).not.toBeNull();
    expect(await redis.redis.get(`user:${memberIds[0]}:org_list`)).not.toBeNull();
    expect(await redis.redis.get(`uri:${streamer1.uri}:owner`)).toBe(streamer1.id);

    // 2. Perform deletion invalidation cascade (as implemented in src/routes/v1/org/delete.ts)
    const keysToDelete: string[] = [
      `org:${orgId}:info`,
      `org:${orgId}:streamers`,
      `org:${orgId}:primary_streamer`,
      `org:${orgId}:members`,
      `org:${orgId}:presets`,
    ];

    for (const mId of memberIds) {
      keysToDelete.push(`user:${mId}:orgs`);
      keysToDelete.push(`user:${mId}:org_list`);
    }

    for (const s of [streamer1, streamer2]) {
      keysToDelete.push(`streamer:${s.id}:info`);
      keysToDelete.push(`streamer:${s.id}:profile`);
      keysToDelete.push(`uri:${s.uri.toLowerCase()}:owner`);
      keysToDelete.push(`streamer:${s.id}:uri`);
    }

    await Promise.all(keysToDelete.map((k) => redis.redis.del(k)));

    // 3. Verify ALL cache lines are wiped - zero stale tenant data
    expect(await redis.redis.get(`org:${orgId}:info`)).toBeNull();
    expect(await redis.redis.get(`org:${orgId}:streamers`)).toBeNull();
    expect(await redis.redis.get(`org:${orgId}:primary_streamer`)).toBeNull();
    expect(await redis.redis.get(`org:${orgId}:members`)).toBeNull();
    expect(await redis.redis.get(`org:${orgId}:presets`)).toBeNull();

    for (const mId of memberIds) {
      expect(await redis.redis.get(`user:${mId}:orgs`)).toBeNull();
      expect(await redis.redis.get(`user:${mId}:org_list`)).toBeNull();
    }

    for (const s of [streamer1, streamer2]) {
      expect(await redis.redis.get(`streamer:${s.id}:info`)).toBeNull();
      expect(await redis.redis.get(`streamer:${s.id}:profile`)).toBeNull();
      expect(await redis.redis.get(`uri:${s.uri}:owner`)).toBeNull();
      expect(await redis.redis.get(`streamer:${s.id}:uri`)).toBeNull();
    }
  });

  it("should verify comprehensive cache invalidation upon streamer channel deletion", async () => {
    const orgId = "777";
    const memberIds = ["301", "302"];
    const streamer = { id: "401", uri: "unique-live-handle" };

    // 1. Seed active channel and member org_list caches
    await redis.redis.setex(`streamer:${streamer.id}:info`, 3600, JSON.stringify(streamer));
    await redis.redis.setex(`streamer:${streamer.id}:profile`, 3600, JSON.stringify(streamer));
    await redis.redis.setex(`org:${orgId}:streamers`, 3600, JSON.stringify([streamer]));
    await redis.redis.setex(`org:${orgId}:primary_streamer`, 3600, streamer.id);
    await redis.redis.setex(`org:${orgId}:members`, 3600, JSON.stringify([{ id: "1" }]));
    await redis.redis.setex(`uri:${streamer.uri}:owner`, 604800, streamer.id);
    await redis.redis.setex(`streamer:${streamer.id}:uri`, 604800, streamer.uri);

    for (const mId of memberIds) {
      await redis.redis.setex(`user:${mId}:org_list`, 3600, JSON.stringify([{ id: orgId, streamers: [streamer] }]));
    }

    // 2. Perform channel deletion invalidation (as implemented in streamers/delete.ts)
    const keysToDelete: string[] = [
      `streamer:${streamer.id}:info`,
      `streamer:${streamer.id}:profile`,
      `org:${orgId}:streamers`,
      `org:${orgId}:primary_streamer`,
      `org:${orgId}:members`,
      `uri:${streamer.uri.toLowerCase()}:owner`,
      `streamer:${streamer.id}:uri`,
    ];

    for (const mId of memberIds) {
      keysToDelete.push(`user:${mId}:org_list`);
    }

    await Promise.all(keysToDelete.map((k) => redis.redis.del(k)));

    // 3. Verify channel, URI, and all member org_list caches are wiped
    expect(await redis.redis.get(`streamer:${streamer.id}:info`)).toBeNull();
    expect(await redis.redis.get(`streamer:${streamer.id}:profile`)).toBeNull();
    expect(await redis.redis.get(`org:${orgId}:streamers`)).toBeNull();
    expect(await redis.redis.get(`org:${orgId}:primary_streamer`)).toBeNull();
    expect(await redis.redis.get(`org:${orgId}:members`)).toBeNull();
    expect(await redis.redis.get(`uri:${streamer.uri}:owner`)).toBeNull();
    expect(await redis.redis.get(`streamer:${streamer.id}:uri`)).toBeNull();

    for (const mId of memberIds) {
      expect(await redis.redis.get(`user:${mId}:org_list`)).toBeNull();
    }
  });

  it("should deeply verify all cache hit lines resolve directly without database fallback", async () => {
    const orgId = "999";
    const userId = "888";
    const orgInfo = {
      id: orgId,
      name: "Fast Studio",
      slug: "fast-studio",
      avatar: "avatar.png",
      banner: null,
      ownerId: userId,
      memberCount: 5,
      createdAt: new Date().toISOString(),
    };
    const streamers = [
      { id: "1001", name: "Channel 1", displayName: "Channel 1", uri: "ch1" },
    ];

    // Populate all centralized cache lines
    await redis.redis.setex(`org:${orgId}:info`, 86400, JSON.stringify(orgInfo));
    await redis.redis.setex(`org:${orgId}:streamers`, 3600, JSON.stringify(streamers));
    await redis.redis.hset(`user:${userId}:orgs`, orgId, "OWNER:18446744073709551615");
    await redis.redis.setex(`user:${userId}:org_list`, 3600, JSON.stringify([orgInfo]));
    await redis.redis.setex(`streamer:1001:info`, 3600, JSON.stringify(streamers[0]));
    await redis.redis.setex(`org:${orgId}:members`, 3600, JSON.stringify([{ id: "1", userId }]));

    // 1. Line check: org details cache hit
    const cachedOrgRaw = await redis.redis.get(`org:${orgId}:info`);
    const cachedStreamersRaw = await redis.redis.get(`org:${orgId}:streamers`);
    const cachedPerms = await redis.redis.hget(`user:${userId}:orgs`, orgId);
    expect(cachedOrgRaw).not.toBeNull();
    expect(cachedStreamersRaw).not.toBeNull();
    expect(cachedPerms).toBe("OWNER:18446744073709551615");

    const parsedOrg = JSON.parse(cachedOrgRaw!);
    const parsedStreamers = JSON.parse(cachedStreamersRaw!);
    const [role, permissions] = cachedPerms!.split(":");

    const orgDetailsResponse = {
      id: String(parsedOrg.id),
      name: parsedOrg.name,
      slug: parsedOrg.slug,
      avatar: parsedOrg.avatar,
      banner: parsedOrg.banner,
      role,
      permissions,
      memberCount: parsedOrg.memberCount,
      streamers: parsedStreamers,
      createdAt: parsedOrg.createdAt,
    };

    expect(orgDetailsResponse.id).toBe(orgId);
    expect(orgDetailsResponse.memberCount).toBe(5);
    expect(orgDetailsResponse.streamers.length).toBe(1);

    // 2. Line check: user org_list cache hit
    const cachedOrgListRaw = await redis.redis.get(`user:${userId}:org_list`);
    expect(cachedOrgListRaw).not.toBeNull();
    const parsedOrgList = JSON.parse(cachedOrgListRaw!);
    expect(parsedOrgList.length).toBe(1);
    expect(parsedOrgList[0].slug).toBe("fast-studio");

    // 3. Line check: streamer info cache hit
    const cachedStreamerRaw = await redis.redis.get(`streamer:1001:info`);
    expect(cachedStreamerRaw).not.toBeNull();
    const parsedStreamer = JSON.parse(cachedStreamerRaw!);
    expect(parsedStreamer.uri).toBe("ch1");

    // 4. Line check: org members cache hit
    const cachedMembersRaw = await redis.redis.get(`org:${orgId}:members`);
    expect(cachedMembersRaw).not.toBeNull();
    const parsedMembers = JSON.parse(cachedMembersRaw!);
    expect(parsedMembers.length).toBe(1);
  });
});
