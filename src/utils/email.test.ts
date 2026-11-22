import { describe, expect, it } from "bun:test";
import { isValidEmailFormat, validateEmailWithMx } from "./email";

describe("Email & MX Validation", () => {
  it("validates email format properly", () => {
    expect(isValidEmailFormat("user@example.com")).toBe(true);
    expect(isValidEmailFormat("invalid-email")).toBe(false);
    expect(isValidEmailFormat("user@domain")).toBe(false);
    expect(isValidEmailFormat("")).toBe(false);
  });

  it("accepts emails whose domain returns MX records", async () => {
    const res = await validateEmailWithMx("  User@Example.com ", async () => [
      { exchange: "mail.example.com", priority: 10 },
    ]);
    expect(res.valid).toBe(true);
    expect(res.normalized).toBe("user@example.com");
  });

  it("rejects emails with empty MX records or DNS errors", async () => {
    const empty = await validateEmailWithMx("user@nomx.example", async () => []);
    expect(empty.valid).toBe(false);

    const errored = await validateEmailWithMx("user@broken.example", async () => {
      throw new Error("ENOTFOUND");
    });
    expect(errored.valid).toBe(false);
  });
});
