import { describe, expect, it } from "bun:test";
import {
  supported_providers,
  allowed_user_update_providers,
  providerAliases,
  resolveProvider,
} from "../src/classes/streamer";
import { endpoint as integrationEndpoint } from "../src/routes/v1/org/streamers/integration";

describe("Integrations Logic", () => {
  it("should list all supported payment & trigger providers", () => {
    expect(supported_providers).toContain("stripe");
    expect(supported_providers).toContain("buymeacoffee");
    expect(supported_providers).toContain("kofi");
    expect(supported_providers).toContain("streamlabs");
    expect(supported_providers).toContain("feelfreepay");
  });

  it("should correctly resolve direct provider names", () => {
    expect(resolveProvider("stripe")).toBe("stripe");
    expect(resolveProvider("kofi")).toBe("kofi");
    expect(resolveProvider("buymeacoffee")).toBe("buymeacoffee");
    expect(resolveProvider("streamlabs")).toBe("streamlabs");
  });

  it("should correctly resolve provider aliases", () => {
    expect(resolveProvider("bmac")).toBe("buymeacoffee");
    expect(resolveProvider("ffp")).toBe("feelfreepay");
    expect(resolveProvider("BMAC")).toBe("buymeacoffee");
  });

  it("should return null for unsupported/invalid providers", () => {
    expect(resolveProvider("paypal_unsupported")).toBeNull();
    expect(resolveProvider("unknown_provider")).toBeNull();
    expect(resolveProvider("")).toBeNull();
  });

  it("should restrict user-updatable providers to secure subset", () => {
    expect(allowed_user_update_providers).toContain("stripe");
    expect(allowed_user_update_providers).toContain("buymeacoffee");
    expect(allowed_user_update_providers).toContain("kofi");
    // Streamlabs uses OAuth callback and should not be direct user update
    expect(allowed_user_update_providers.includes("streamlabs" as any)).toBe(false);
  });

  it("should enforce authentication guards on all endpoints across integration paths", async () => {
    const testCases = [
      { method: "GET", path: "/1/streamers/2/integration" },
      { method: "GET", path: "/1/streamers/2/integration/streamlabs" },
      { method: "GET", path: "/1/streamers/2/integration/streamlabs/logs" },
      { method: "GET", path: "/1/streamers/2/integration/streamlabs/oauth2" },
      { method: "GET", path: "/1/streamers/2/integration/stripe/oauth2" },
      { method: "POST", path: "/1/streamers/2/integration/streamlabs", body: JSON.stringify({ code: "mock" }) },
      { method: "PATCH", path: "/1/streamers/2/integration/streamlabs", body: JSON.stringify({ options: 1 }) },
      { method: "DELETE", path: "/1/streamers/2/integration/streamlabs" },
      { method: "POST", path: "/1/streamers/2/integration/stripe", body: JSON.stringify({ secret: "mock" }) },
      {
        method: "POST",
        path: "/1/streamers/2/integration/stripe",
        body: JSON.stringify({
          token: "tok_123",
          secretType: "oauth",
          state: "state_abc",
          payload: { full: true, metadata: { extra: 1 } },
          custom_extra_key: "preserved",
        }),
      },
      { method: "POST", path: "/1/streamers/2/integration/kofi", body: JSON.stringify({ username: "u", secret: "s" }) },
      { method: "POST", path: "/1/streamers/2/integration/buymeacoffee", body: JSON.stringify({ username: "u", secret: "s" }) },
      { method: "POST", path: "/1/streamers/2/integration/bmac", body: JSON.stringify({ username: "u", secret: "s" }) },
      { method: "POST", path: "/1/streamers/2/integration/feelfreepay", body: JSON.stringify({ secret: "mock" }) },
      { method: "POST", path: "/1/streamers/2/integration/ffp", body: JSON.stringify({ secret: "mock" }) },
      { method: "PATCH", path: "/1/streamers/2/integration/stripe", body: JSON.stringify({ disabled: true }) },
      { method: "DELETE", path: "/1/streamers/2/integration/stripe" },
    ];

    for (const { method, path, body } of testCases) {
      const headers: Record<string, string> = body ? { "Content-Type": "application/json" } : {};
      const res = await integrationEndpoint.handle(new Request(`http://localhost${path}`, { method, headers, body }));
      expect([400, 401, 403, 500]).toContain(res.status);
    }
  });

  it("should enforce provider-specific body schemas", async () => {
    const invalidCases = [
      { path: "/1/streamers/2/integration/buymeacoffee", body: JSON.stringify({}) },
      { path: "/1/streamers/2/integration/buymeacoffee", body: JSON.stringify({ username: "u" }) },
      { path: "/1/streamers/2/integration/kofi", body: JSON.stringify({}) },
      { path: "/1/streamers/2/integration/kofi", body: JSON.stringify({ secret: "s" }) },
      { path: "/1/streamers/2/integration/streamlabs", body: JSON.stringify({}) },
      { path: "/1/streamers/2/integration/feelfreepay", body: JSON.stringify({}) },
    ];

    for (const { path, body } of invalidCases) {
      const res = await integrationEndpoint.handle(
        new Request(`http://localhost${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        }),
      );
      expect(res.status).toBe(422);
    }
  });
});
