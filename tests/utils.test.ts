import { describe, it, expect } from "vitest";
import { cn, initials, colorFromString, isOverdue, isDueToday, formatDueDate } from "@/lib/utils";

describe("cn", () => {
  it("merges tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
  it("handles conditional classes", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });
});

describe("initials", () => {
  it("single name returns first 2 chars uppercased", () => {
    expect(initials("Alice")).toBe("AL");
  });
  it("two names returns first letters", () => {
    expect(initials("Jean Dupont")).toBe("JD");
  });
  it("empty string returns ?", () => {
    expect(initials("")).toBe("?");
  });
  it("whitespace only returns ?", () => {
    expect(initials("   ")).toBe("?");
  });
});

describe("colorFromString", () => {
  it("returns a hex color", () => {
    expect(colorFromString("test")).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("is stable for the same input", () => {
    expect(colorFromString("kanby")).toBe(colorFromString("kanby"));
  });
  it("differs for different inputs (usually)", () => {
    // Not guaranteed for all pairs, but for these two it is.
    expect(colorFromString("a")).not.toBe(colorFromString("z"));
  });
});

describe("isOverdue", () => {
  it("null returns false", () => {
    expect(isOverdue(null)).toBe(false);
  });
  it("past date returns true", () => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(isOverdue(past)).toBe(true);
  });
  it("future date returns false", () => {
    const future = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(isOverdue(future)).toBe(false);
  });
});

describe("isDueToday", () => {
  it("null returns false", () => {
    expect(isDueToday(null)).toBe(false);
  });
  it("now returns true", () => {
    expect(isDueToday(new Date().toISOString())).toBe(true);
  });
  it("tomorrow returns false", () => {
    const tomorrow = new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString();
    expect(isDueToday(tomorrow)).toBe(false);
  });
});

describe("formatDueDate", () => {
  it("null returns null", () => {
    expect(formatDueDate(null)).toBeNull();
  });
  it("returns a non-empty string for a valid date", () => {
    expect(typeof formatDueDate("2024-01-15T00:00:00Z")).toBe("string");
    expect(formatDueDate("2024-01-15T00:00:00Z")!.length).toBeGreaterThan(0);
  });
});