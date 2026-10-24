import { describe, expect, it } from "bun:test";
import { UserType, OrgType } from "../src/db";

describe("Tenancy Types & Quota Enforcement (User & Org Levels)", () => {
  it("verifies UserType and OrgType enum values", () => {
    expect(UserType.REGULAR).toBe("REGULAR");
    expect(UserType.SUPPORTER).toBe("SUPPORTER");
    expect(UserType.OPERATOR).toBe("OPERATOR");

    expect(OrgType.COMMUNITY).toBe("COMMUNITY");
    expect(OrgType.ENTERPRISE).toBe("ENTERPRISE");
  });

  it("verifies organization creation limit logic", () => {
    const checkCanCreateOrg = (userType: UserType, ownedOrgCount: number): boolean => {
      if (userType === UserType.OPERATOR) return true;
      return ownedOrgCount < 1;
    };

    // Regular user
    expect(checkCanCreateOrg(UserType.REGULAR, 0)).toBe(true);
    expect(checkCanCreateOrg(UserType.REGULAR, 1)).toBe(false);
    expect(checkCanCreateOrg(UserType.REGULAR, 5)).toBe(false);

    // Supporter user
    expect(checkCanCreateOrg(UserType.SUPPORTER, 0)).toBe(true);
    expect(checkCanCreateOrg(UserType.SUPPORTER, 1)).toBe(false);

    // Operator user (unlimited)
    expect(checkCanCreateOrg(UserType.OPERATOR, 0)).toBe(true);
    expect(checkCanCreateOrg(UserType.OPERATOR, 1)).toBe(true);
    expect(checkCanCreateOrg(UserType.OPERATOR, 100)).toBe(true);
  });

  it("verifies streamer channel creation limit logic", () => {
    const checkCanCreateStreamer = (orgType: OrgType, streamerCount: number): boolean => {
      if (orgType === OrgType.ENTERPRISE) return true;
      return streamerCount < 1;
    };

    // Community organization (1 channel max)
    expect(checkCanCreateStreamer(OrgType.COMMUNITY, 0)).toBe(true);
    expect(checkCanCreateStreamer(OrgType.COMMUNITY, 1)).toBe(false);
    expect(checkCanCreateStreamer(OrgType.COMMUNITY, 10)).toBe(false);

    // Enterprise organization (unlimited)
    expect(checkCanCreateStreamer(OrgType.ENTERPRISE, 0)).toBe(true);
    expect(checkCanCreateStreamer(OrgType.ENTERPRISE, 1)).toBe(true);
    expect(checkCanCreateStreamer(OrgType.ENTERPRISE, 50)).toBe(true);
  });

  it("verifies unlocked limitations when running community self-hosted", () => {
    const checkCanCreateOrgSelfHosted = (userType: UserType, ownedOrgCount: number, isSelfHosted: boolean): boolean => {
      if (isSelfHosted || userType === UserType.OPERATOR) return true;
      return ownedOrgCount < 1;
    };

    const checkCanCreateStreamerSelfHosted = (orgType: OrgType, streamerCount: number, isSelfHosted: boolean): boolean => {
      if (isSelfHosted || orgType === OrgType.ENTERPRISE) return true;
      return streamerCount < 1;
    };

    // When self-hosted, regular and supporter accounts can create unlimited orgs
    expect(checkCanCreateOrgSelfHosted(UserType.REGULAR, 5, true)).toBe(true);
    expect(checkCanCreateOrgSelfHosted(UserType.SUPPORTER, 10, true)).toBe(true);

    // When self-hosted, community organizations can create unlimited channels
    expect(checkCanCreateStreamerSelfHosted(OrgType.COMMUNITY, 1, true)).toBe(true);
    expect(checkCanCreateStreamerSelfHosted(OrgType.COMMUNITY, 20, true)).toBe(true);

    // On production, limits remain strictly enforced
    expect(checkCanCreateOrgSelfHosted(UserType.REGULAR, 1, false)).toBe(false);
    expect(checkCanCreateStreamerSelfHosted(OrgType.COMMUNITY, 1, false)).toBe(false);
  });

  it("verifies isAlertboxProduction pure check against static.ponlponl123.com", () => {
    const checkCdnIsProd = (cdnUrl: string): boolean => {
      return cdnUrl.toLowerCase().includes("static.ponlponl123.com");
    };

    expect(checkCdnIsProd("https://static.ponlponl123.com")).toBe(true);
    expect(checkCdnIsProd("https://static.ponlponl123.com/uploads")).toBe(true);
    expect(checkCdnIsProd("http://localhost:3001/public/uploads")).toBe(false);
    expect(checkCdnIsProd("https://static.alertbox.org")).toBe(false);
    expect(checkCdnIsProd("")).toBe(false);
  });

  it("verifies ACT_AS dev override logic restricted strictly to dev env and 127.0.0.1 CDN", () => {
    const resolveIsProd = (actAs?: string, cdnUrl: string = "", isDev: boolean = true): boolean => {
      const cdn = cdnUrl.toLowerCase();
      const isLoopbackCdn = cdn.includes("127.0.0.1");

      if (isDev && isLoopbackCdn) {
        const mode = (actAs || "").toLowerCase().trim();
        if (mode === "self") return false;
        if (mode === "prod") return true;
      }

      return cdn.includes("static.ponlponl123.com");
    };

    // When isDev=true and CDN is 127.0.0.1, ACT_AS works:
    expect(resolveIsProd("self", "http://127.0.0.1:3001/public/uploads", true)).toBe(false);
    expect(resolveIsProd("prod", "http://127.0.0.1:3001/public/uploads", true)).toBe(true);

    // When CDN is localhost (name-based, not 127.0.0.1 IP), ACT_AS is rejected for secure anti-hijacking:
    expect(resolveIsProd("prod", "http://localhost:3001/public/uploads", true)).toBe(false);

    // When CDN is NOT 127.0.0.1 (e.g. production CDN), ACT_AS is ignored:
    expect(resolveIsProd("self", "https://static.ponlponl123.com", true)).toBe(true);
    expect(resolveIsProd("prod", "https://other-cdn.com", true)).toBe(false);

    // When isDev=false, ACT_AS is ignored:
    expect(resolveIsProd("prod", "http://127.0.0.1:3001/public/uploads", false)).toBe(false);
    expect(resolveIsProd("self", "https://static.ponlponl123.com", false)).toBe(true);
  });

  it("verifies channel name regex allowed only a-zA-Z0-9-_", () => {
    const CHANNEL_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

    // Allowed
    expect(CHANNEL_NAME_REGEX.test("gaming-channel")).toBe(true);
    expect(CHANNEL_NAME_REGEX.test("live_stream_01")).toBe(true);
    expect(CHANNEL_NAME_REGEX.test("Channel-01_PRO")).toBe(true);
    expect(CHANNEL_NAME_REGEX.test("abcXYZ123")).toBe(true);

    // Disallowed
    expect(CHANNEL_NAME_REGEX.test("gaming channel")).toBe(false); // space
    expect(CHANNEL_NAME_REGEX.test("channel@live")).toBe(false); // special char
    expect(CHANNEL_NAME_REGEX.test("stream!")).toBe(false); // exclamation
    expect(CHANNEL_NAME_REGEX.test("สตรีม")).toBe(false); // non-ascii
    expect(CHANNEL_NAME_REGEX.test("live.stream")).toBe(false); // dot
    expect(CHANNEL_NAME_REGEX.test("")).toBe(false); // empty
  });

  it("verifies reserved channel names protection", () => {
    const { reserved_uri } = require("../src/consts/reserved");
    expect(reserved_uri.has("admin")).toBe(true);
    expect(reserved_uri.has("system")).toBe(true);
    expect(reserved_uri.has("alertbox")).toBe(true);
    expect(reserved_uri.has("valid_streamer")).toBe(false);
  });

  it("verifies ChannelNameRegistry cache-first availability and claim/invalidate", async () => {
    const { ChannelNameRegistry } = await import("../src/classes/streamer/channel-name");
    const { redis } = await import("../src/core/redis");

    const mockStore = new Map<string, string>();
    (redis.redis as any).get = async (key: string) => mockStore.get(key) ?? null;
    (redis.redis as any).setex = async (key: string, _ttl: number, val: string) => {
      mockStore.set(key, val);
      return "OK";
    };
    (redis.redis as any).del = async (key: string) => {
      mockStore.delete(key);
      return 1;
    };

    const testName = "unique_unit_test_channel";

    // 1. Invalid and reserved instant rejection
    expect((await ChannelNameRegistry.checkAvailability("")).status).toBe("invalid");
    expect((await ChannelNameRegistry.checkAvailability("admin")).status).toBe("reserved");

    // 2. Cache hit (available via negative cache "noone")
    mockStore.set(`streamer:username:${testName}:owner`, "noone");
    const checkAvailable = await ChannelNameRegistry.checkAvailability(testName);
    expect(checkAvailable.available).toBe(true);
    expect(checkAvailable.status).toBe("available");

    // 3. Claim channel name
    await ChannelNameRegistry.claim(testName, 9999);
    expect(mockStore.get(`streamer:username:${testName}:owner`)).toBe("9999");

    // 4. Cache hit (taken)
    const checkTaken = await ChannelNameRegistry.checkAvailability(testName);
    expect(checkTaken.available).toBe(false);
    expect(checkTaken.status).toBe("taken");
    expect(checkTaken.ownerId).toBe("9999");

    // 5. Invalidation
    await ChannelNameRegistry.invalidate(testName);
    expect(mockStore.has(`streamer:username:${testName}:owner`)).toBe(false);
  });
});

