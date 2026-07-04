import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit } from "@/lib/rate-limit";

// Minimal mock of NextRequest with the shape rate-limit uses.
function mockReq(ip: string, forwardedFor?: string) {
  const headers = new Map<string, string>();
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  return {
    ip,
    headers: {
      get: (name: string) => headers.get(name.toLowerCase()) ?? null,
    },
  } as unknown as import("next/server").NextRequest;
}

describe("rateLimit", () => {
  // Each test uses a unique namespace so buckets don't bleed between tests.
  const ns = "test-" + Math.random().toString(36).slice(2);

  it("allows requests under the limit", () => {
    for (let i = 0; i < 5; i++) {
      const r = rateLimit(mockReq("1.2.3.4"), ns, 5, 60);
      expect(r.ok).toBe(true);
    }
  });

  it("blocks the 6th request when max is 5", () => {
    const localNs = ns + "-block";
    for (let i = 0; i < 5; i++) rateLimit(mockReq("10.0.0.1"), localNs, 5, 60);
    const r = rateLimit(mockReq("10.0.0.1"), localNs, 5, 60);
    expect(r.ok).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it("counts per IP independently", () => {
    const localNs = ns + "-perip";
    for (let i = 0; i < 5; i++) rateLimit(mockReq("1.1.1.1"), localNs, 5, 60);
    // Different IP should still be allowed.
    const r = rateLimit(mockReq("2.2.2.2"), localNs, 5, 60);
    expect(r.ok).toBe(true);
  });

  it("respects X-Forwarded-For", () => {
    const localNs = ns + "-xff";
    const r1 = rateLimit(mockReq("9.9.9.9", "5.5.5.5"), localNs, 3, 60);
    expect(r1.ok).toBe(true);
    // Same forwarded IP → counts against the same bucket.
    rateLimit(mockReq("9.9.9.9", "5.5.5.5"), localNs, 3, 60);
    rateLimit(mockReq("9.9.9.9", "5.5.5.5"), localNs, 3, 60);
    const r4 = rateLimit(mockReq("9.9.9.9", "5.5.5.5"), localNs, 3, 60);
    expect(r4.ok).toBe(false);
  });

  it("decrements remaining", () => {
    const localNs = ns + "-remaining";
    const r1 = rateLimit(mockReq("7.7.7.7"), localNs, 3, 60);
    expect(r1.remaining).toBe(2);
    const r2 = rateLimit(mockReq("7.7.7.7"), localNs, 3, 60);
    expect(r2.remaining).toBe(1);
  });
});