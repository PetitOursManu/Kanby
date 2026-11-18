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
import { getTranslator, translateApiError } from "@/lib/i18n";
import { dueState, dayKey, formatDay } from "@/lib/format";
import { safeNext } from "@/lib/safe-redirect";
import { fr } from "@/lib/i18n/fr";
import { en } from "@/lib/i18n/en";

describe("i18n", () => {
  it("has the same keys in French and English", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });
  it("uses the _one form when count is 1", () => {
    const t = getTranslator("en");
    expect(t("boards.tasksCount", { count: 1 })).toBe("1 task");
    expect(t("boards.tasksCount", { count: 3 })).toBe("3 tasks");
  });
  it("translates known API errors", () => {
    expect(translateApiError("Identifiants invalides", getTranslator("en"))).toBe("Invalid credentials");
    expect(translateApiError("Something else", getTranslator("en"))).toBe("Something else");
  });
});

describe("due dates (calendar days)", () => {
  const now = new Date(2030, 0, 15, 23, 30); // local 15 Jan, late evening
  it("compares days, not instants", () => {
    expect(dueState("2030-01-14T00:00:00.000Z", now)).toBe("overdue");
    expect(dueState("2030-01-15T00:00:00.000Z", now)).toBe("today");
    expect(dueState("2030-01-17T00:00:00.000Z", now)).toBe("soon");
    expect(dueState("2030-02-20T00:00:00.000Z", now)).toBe("later");
    expect(dueState(null, now)).toBeNull();
  });
  it("formats in UTC so the day never shifts", () => {
    expect(dayKey("2030-01-15T00:00:00.000Z")).toBe("2030-01-15");
    expect(formatDay("2030-01-15T00:00:00.000Z", "en")).toBe("15 Jan");
  });
});

describe("safeNext", () => {
  it("only allows same-site paths", () => {
    expect(safeNext("/boards/abc")).toBe("/boards/abc");
    expect(safeNext("https://evil.example")).toBe("/boards");
    expect(safeNext("//evil.example")).toBe("/boards");
    expect(safeNext("/\\evil.example")).toBe("/boards");
    expect(safeNext(null)).toBe("/boards");
  });
});
