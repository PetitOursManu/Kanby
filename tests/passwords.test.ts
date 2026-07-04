import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, isPasswordValid } from "@/lib/auth/passwords";

describe("isPasswordValid", () => {
  it("rejects short passwords", () => {
    expect(isPasswordValid("abc")).toBe(false);
    expect(isPasswordValid("1234567")).toBe(false);
  });
  it("accepts 8+ chars", () => {
    expect(isPasswordValid("12345678")).toBe(true);
    expect(isPasswordValid("a-very-long-password")).toBe(true);
  });
  it("rejects non-strings", () => {
    expect(isPasswordValid(null as unknown as string)).toBe(false);
    expect(isPasswordValid(undefined as unknown as string)).toBe(false);
    expect(isPasswordValid(12345678 as unknown as string)).toBe(false);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("mysecret123");
    expect(hash).not.toBe("mysecret123");
    expect(await verifyPassword("mysecret123", hash)).toBe(true);
  });
  it("rejects wrong password", async () => {
    const hash = await hashPassword("mysecret123");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
  it("produces different hashes for the same password (salt)", async () => {
    const h1 = await hashPassword("same");
    const h2 = await hashPassword("same");
    expect(h1).not.toBe(h2);
  });
});