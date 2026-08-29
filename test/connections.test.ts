import { describe, expect, it } from "bun:test";
import {
  supported_providers,
  allowed_user_update_providers,
  providerAliases,
  resolveProvider,
} from "../src/classes/me/connections";

describe("Connections & Integrations Logic", () => {
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
});
