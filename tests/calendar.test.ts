import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKey,
  formatWeekRange,
  isoWeek,
  monthGrid,
  parseDay,
  periodBoardName,
  periodStart,
  startOfWeek,
} from "@/lib/calendar";

const d = (s: string) => parseDay(s)!;

describe("calendar dates", () => {
  it("parses only real YYYY-MM-DD days", () => {
    expect(dayKey(d("2026-11-24"))).toBe("2026-11-24");
    expect(parseDay("2026-02-30")).toBeNull();
    expect(parseDay("2026-13-01")).toBeNull();
    expect(parseDay("24/11/2026")).toBeNull();
    expect(parseDay("2026-11-24T10:00")).toBeNull();
    expect(parseDay(42)).toBeNull();
    expect(dayKey(d("2028-02-29"))).toBe("2028-02-29");
  });

  it("weeks start on Monday", () => {
    expect(dayKey(startOfWeek(d("2026-11-24")))).toBe("2026-11-23"); // Tuesday → Monday
    expect(dayKey(startOfWeek(d("2026-11-29")))).toBe("2026-11-23"); // Sunday → Monday
    expect(dayKey(startOfWeek(d("2026-11-23")))).toBe("2026-11-23");
    expect(dayKey(periodStart("DAY", d("2026-11-29")))).toBe("2026-11-29");
    expect(dayKey(periodStart("WEEK", d("2026-11-29")))).toBe("2026-11-23");
  });

  it("numbers weeks following ISO 8601", () => {
    expect(isoWeek(d("2026-11-24"))).toEqual({ year: 2026, week: 48 });
    expect(isoWeek(d("2026-01-01"))).toEqual({ year: 2026, week: 1 });
    expect(isoWeek(d("2027-01-01"))).toEqual({ year: 2026, week: 53 });
    expect(isoWeek(d("2024-12-30"))).toEqual({ year: 2025, week: 1 });
  });

  it("builds full weeks around a month", () => {
    const grid = monthGrid(d("2026-11-15"));
    expect(grid).toHaveLength(6);
    expect(dayKey(grid[0][0])).toBe("2026-10-26");
    expect(dayKey(grid[5][6])).toBe("2026-12-06");
    for (const week of grid) expect(week).toHaveLength(7);
    // February 2027 starts on a Monday and has exactly 4 weeks.
    expect(monthGrid(d("2027-02-10"))).toHaveLength(4);
  });

  it("names day and week boards automatically", () => {
    const week = (n: number) => `Semaine ${n}`;
    expect(periodBoardName("Elisa30", "DAY", d("2026-11-24"), "fr", week)).toBe("Elisa30 — Mardi 24 novembre 2026");
    expect(periodBoardName("Elisa30", "WEEK", d("2026-11-23"), "fr", week)).toBe("Elisa30 — Semaine 48 · 23 → 29 nov. 2026");
    expect(periodBoardName("Elisa30", "DAY", d("2026-11-24"), "en", (n) => `Week ${n}`)).toBe("Elisa30 — Tuesday, 24 November 2026");
  });

  it("formats weeks spanning two months or two years", () => {
    expect(formatWeekRange(d("2026-11-30"), "fr")).toBe("30 nov. → 6 déc. 2026");
    expect(formatWeekRange(d("2025-12-29"), "fr")).toBe("29 déc. 2025 → 4 janv. 2026");
    expect(dayKey(addDays(d("2026-12-31"), 1))).toBe("2027-01-01");
  });
});
