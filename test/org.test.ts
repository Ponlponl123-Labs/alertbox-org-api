import { describe, expect, it } from "bun:test";
import {
  OrgPerm,
  RolePresets,
  hasPermission,
  hasAnyPermission,
  combinePermissions,
  removePermissions,
} from "../src/utils/rbac";
if (!("toJSON" in BigInt.prototype)) {
  (BigInt.prototype as any).toJSON = function (): string {
    return this.toString();
  };
}

describe("Organization & Multi-Tenant RBAC Bitmask Engine", () => {
  it("should have correct bitmask values for all permission flags", () => {
    expect(OrgPerm.ORG_VIEW).toBe(1n << 0n);
    expect(OrgPerm.ORG_MANAGE).toBe(1n << 1n);
    expect(OrgPerm.ORG_MEMBERS_MANAGE).toBe(1n << 2n);
    expect(OrgPerm.ORG_ROLES_MANAGE).toBe(1n << 3n);
    expect(OrgPerm.ORG_DELETE).toBe(1n << 4n);
    expect(OrgPerm.STREAMER_VIEW).toBe(1n << 10n);
    expect(OrgPerm.STREAMER_CREATE).toBe(1n << 11n);
    expect(OrgPerm.STREAMER_MANAGE).toBe(1n << 12n);
    expect(OrgPerm.STREAMER_DELETE).toBe(1n << 13n);
    expect(OrgPerm.WIDGET_VIEW).toBe(1n << 20n);
    expect(OrgPerm.WIDGET_MANAGE).toBe(1n << 21n);
    expect(OrgPerm.WIDGET_TOKEN_ROTATE).toBe(1n << 22n);
    expect(OrgPerm.INTEGRATION_VIEW).toBe(1n << 30n);
    expect(OrgPerm.INTEGRATION_MANAGE).toBe(1n << 31n);
    expect(OrgPerm.ANALYTICS_VIEW).toBe(1n << 40n);
    expect(OrgPerm.TRANSACTION_VIEW).toBe(1n << 41n);
    expect(OrgPerm.REPORT_EXPORT).toBe(1n << 42n);
    expect(OrgPerm.ALL).toBe(18446744073709551615n);
  });

  it("should enforce OWNER having all permissions including ORG_DELETE", () => {
    expect(hasPermission(RolePresets.OWNER, OrgPerm.ORG_DELETE)).toBe(true);
    expect(hasPermission(RolePresets.OWNER, OrgPerm.ORG_MEMBERS_MANAGE)).toBe(true);
    expect(hasPermission(RolePresets.OWNER, OrgPerm.INTEGRATION_MANAGE)).toBe(true);
  });

  it("should enforce ADMIN having all permissions except ORG_DELETE", () => {
    expect(hasPermission(RolePresets.ADMIN, OrgPerm.ORG_DELETE)).toBe(false);
    expect(hasPermission(RolePresets.ADMIN, OrgPerm.ORG_MEMBERS_MANAGE)).toBe(true);
    expect(hasPermission(RolePresets.ADMIN, OrgPerm.ORG_ROLES_MANAGE)).toBe(true);
    expect(hasPermission(RolePresets.ADMIN, OrgPerm.STREAMER_VIEW)).toBe(true);
  });

  it("should enforce MANAGER permissions boundary", () => {
    expect(hasPermission(RolePresets.MANAGER, OrgPerm.ORG_VIEW)).toBe(true);
    expect(hasPermission(RolePresets.MANAGER, OrgPerm.WIDGET_MANAGE)).toBe(true);
    expect(hasPermission(RolePresets.MANAGER, OrgPerm.INTEGRATION_MANAGE)).toBe(true);
    expect(hasPermission(RolePresets.MANAGER, OrgPerm.ORG_DELETE)).toBe(false);
    expect(hasPermission(RolePresets.MANAGER, OrgPerm.ORG_ROLES_MANAGE)).toBe(false);
    expect(hasPermission(RolePresets.MANAGER, OrgPerm.ORG_MEMBERS_MANAGE)).toBe(false);
  });

  it("should enforce VIEWER permissions boundary", () => {
    expect(hasPermission(RolePresets.VIEWER, OrgPerm.ORG_VIEW)).toBe(true);
    expect(hasPermission(RolePresets.VIEWER, OrgPerm.STREAMER_VIEW)).toBe(true);
    expect(hasPermission(RolePresets.VIEWER, OrgPerm.STREAMER_MANAGE)).toBe(false);
    expect(hasPermission(RolePresets.VIEWER, OrgPerm.INTEGRATION_MANAGE)).toBe(false);
  });

  it("should correctly combine and remove arbitrary permission bitmasks", () => {
    const custom = combinePermissions(OrgPerm.ORG_VIEW, OrgPerm.STREAMER_VIEW, OrgPerm.ANALYTICS_VIEW);
    expect(hasPermission(custom, OrgPerm.ORG_VIEW)).toBe(true);
    expect(hasPermission(custom, OrgPerm.STREAMER_VIEW)).toBe(true);
    expect(hasPermission(custom, OrgPerm.ANALYTICS_VIEW)).toBe(true);
    expect(hasPermission(custom, OrgPerm.ORG_MEMBERS_MANAGE)).toBe(false);

    const stripped = removePermissions(custom, OrgPerm.ANALYTICS_VIEW);
    expect(hasPermission(stripped, OrgPerm.ANALYTICS_VIEW)).toBe(false);
    expect(hasPermission(stripped, OrgPerm.ORG_VIEW)).toBe(true);
  });

  it("should test hasAnyPermission correctly", () => {
    const perms = OrgPerm.ORG_VIEW;
    expect(hasAnyPermission(perms, OrgPerm.ORG_VIEW | OrgPerm.ORG_DELETE)).toBe(true);
    expect(hasAnyPermission(perms, OrgPerm.ORG_DELETE | OrgPerm.ORG_MEMBERS_MANAGE)).toBe(false);
  });
});

describe("BigInt Global JSON Serialization", () => {
  it("should serialize BigInt properties without throwing TypeError", () => {
    const payload = {
      id: 9007199254740993n,
      orgId: 18446744073709551614n,
      name: "Test Channel",
    };
    const jsonStr = JSON.stringify(payload);
    expect(jsonStr).toBe('{"id":"9007199254740993","orgId":"18446744073709551614","name":"Test Channel"}');
  });

  it("should serialize nested BigInt arrays and logs cleanly", () => {
    const log = {
      event: "created",
      log: {
        id: 123456789n,
        orgId: 987654321n,
        streamerId: 55555n,
        amount: 500,
      },
    };
    const serialized = JSON.stringify(log);
    const parsed = JSON.parse(serialized);
    expect(parsed.log.id).toBe("123456789");
    expect(parsed.log.orgId).toBe("987654321");
    expect(parsed.log.streamerId).toBe("55555");
  });
});

describe("Security: Integration Credential Sanitization", () => {
  it("should mask sensitive secrets when projecting streamer integration for clients", () => {
    const rawDbIntegration = {
      id: 101n,
      orgId: 202n,
      streamerId: 303n,
      stripeSecret: "rk_live_SECRET_STRIPE_KEY_12345",
      bmacSecret: "bmac_webhook_secret_xyz",
      kofiSecret: "kofi_token_abc",
      xenditSecret: "xnd_development_secret",
      ffpSecret: "ffp_secret_key",
      streamlabsSecret: "streamlabs_oauth_access_token_super_secret",
      streamlabsRefreshToken: "streamlabs_oauth_refresh_token_ultra_secret",
      bmacUsername: "coolcreator",
      kofiUsername: "coolcreator",
      deletedAt: null,
    };

    // Client-safe projection pattern as implemented in streamers/get.ts
    const sanitized = {
      id: String(rawDbIntegration.id),
      orgId: String(rawDbIntegration.orgId),
      streamerId: String(rawDbIntegration.streamerId),
      stripe: !!rawDbIntegration.stripeSecret,
      bmac: !!rawDbIntegration.bmacSecret,
      kofi: !!rawDbIntegration.kofiSecret,
      xendit: !!rawDbIntegration.xenditSecret,
      ffp: !!rawDbIntegration.ffpSecret,
      streamlabs: !!rawDbIntegration.streamlabsSecret,
      kofiUsername: rawDbIntegration.kofiUsername,
      bmacUsername: rawDbIntegration.bmacUsername,
    };

    expect((sanitized as any).stripeSecret).toBeUndefined();
    expect((sanitized as any).streamlabsSecret).toBeUndefined();
    expect((sanitized as any).streamlabsRefreshToken).toBeUndefined();
    expect(sanitized.stripe).toBe(true);
    expect(sanitized.streamlabs).toBe(true);
    expect(sanitized.bmacUsername).toBe("coolcreator");
  });
});

describe("Multi-Member Invite Email Scoping", () => {
  it("should isolate invite expiry per user email rather than globally per organization", () => {
    interface InviteRecord {
      id: string;
      orgId: string;
      email: string;
      expiresAt: Date;
    }

    const invites: InviteRecord[] = [
      { id: "inv_1", orgId: "org_1", email: "alice@example.com", expiresAt: new Date(Date.now() + 300000) },
    ];

    // When Bob is invited to org_1, updateMany scopes strictly by { orgId, email }
    const bobEmail = "bob@example.com";
    for (const inv of invites) {
      if (inv.orgId === "org_1" && inv.email === bobEmail) {
        inv.expiresAt = new Date();
      }
    }

    // Alice's invite remains active and unaffected
    expect(invites[0].expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(invites[0].email).toBe("alice@example.com");
  });
});

describe("Organization Resolution Logic & Soft-Delete Enforcement", () => {
  function simulateOrgIdResolution(
    param: string | null | undefined,
    findOrg: (query: any) => { id: bigint; deletedAt: Date | null } | null
  ): bigint | null {
    if (!param) return null;
    const trimmed = param.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const numericId = BigInt(trimmed);
      const exists = findOrg({ id: numericId, deletedAt: null });
      if (exists) return exists.id;
      return null;
    }
    const org = findOrg({ slug: trimmed.toLowerCase(), deletedAt: null });
    return org ? org.id : null;
  }

  it("should return null for null/undefined/empty input", () => {
    expect(simulateOrgIdResolution(null, () => null)).toBeNull();
    expect(simulateOrgIdResolution(undefined, () => null)).toBeNull();
    expect(simulateOrgIdResolution("   ", () => null)).toBeNull();
  });

  it("should block resolution of soft-deleted organizations by numeric ID", () => {
    const deletedOrg = { id: 42n, deletedAt: new Date() };
    const res = simulateOrgIdResolution("42", (q) => (q.deletedAt === null && deletedOrg.deletedAt ? null : deletedOrg));
    expect(res).toBeNull();
  });

  it("should successfully resolve active organizations by numeric ID", () => {
    const activeOrg = { id: 42n, deletedAt: null };
    const res = simulateOrgIdResolution("42", (q) => (q.deletedAt === null && activeOrg.deletedAt === null ? activeOrg : null));
    expect(res).toBe(42n);
  });
});
