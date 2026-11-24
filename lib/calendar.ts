/**
 * Calendar helpers: a board can hold one board per day and per week.
 *
 * Days are plain calendar dates ("2026-11-24"), handled as UTC midnight so
 * they never shift with the server or browser time zone. Weeks start on
 * Monday and are numbered following ISO 8601.
 */
import type { Locale } from "@/lib/i18n";

export type Period = "DAY" | "WEEK";

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_DAY = 86_400_000;

/** Parse "YYYY-MM-DD" into a UTC-midnight date, or null when invalid. */
export function parseDay(input: unknown): Date | null {
  if (typeof input !== "string") return null;
  const m = DAY_RE.exec(input);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1970 || y > 9999) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

/** "YYYY-MM-DD" of a UTC-midnight date. */
export function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_DAY);
}

/** First day of the month, shifted by `months`. */
export function addMonths(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

/** Monday of the week containing `date`. */
export function startOfWeek(date: Date): Date {
  const dow = (date.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(date, -dow);
}

/** Start of the period containing `date` (the day itself, or its Monday). */
export function periodStart(period: Period, date: Date): Date {
  return period === "WEEK" ? startOfWeek(date) : date;
}

/** ISO 8601 week number and week-year. */
export function isoWeek(date: Date): { year: number; week: number } {
  const thursday = addDays(startOfWeek(date), 3);
  const year = thursday.getUTCFullYear();
  const firstThursday = addDays(startOfWeek(new Date(Date.UTC(year, 0, 4))), 3);
  return { year, week: 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * MS_DAY)) };
}

/**
 * Weeks (Monday → Sunday) covering the month of `date`: 4 to 6 rows of 7 days,
 * including the days of the previous / next month that complete them.
 */
export function monthGrid(date: Date): Date[][] {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const last = addDays(addMonths(first, 1), -1);
  const weeks: Date[][] = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(start, i)));
  }
  return weeks;
}

/** Today's date in the given IANA time zone (default: the runtime's). */
export function today(timeZone?: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parseDay(parts) ?? parseDay(new Date().toISOString().slice(0, 10))!;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatDate(date: Date, locale: Locale, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { ...opts, timeZone: "UTC" }).format(date);
}

/** "Lundi 24 novembre 2026" / "Monday 24 November 2026". */
export function formatLongDay(date: Date, locale: Locale): string {
  return capitalize(formatDate(date, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }));
}

/** "Novembre 2026" / "November 2026". */
export function formatMonth(date: Date, locale: Locale): string {
  return capitalize(formatDate(date, locale, { month: "long", year: "numeric" }));
}

/** "24 → 30 nov. 2026", "30 nov. → 6 déc. 2026", "29 déc. 2025 → 4 janv. 2026". */
export function formatWeekRange(monday: Date, locale: Locale): string {
  const sunday = addDays(monday, 6);
  const sameYear = monday.getUTCFullYear() === sunday.getUTCFullYear();
  const sameMonth = sameYear && monday.getUTCMonth() === sunday.getUTCMonth();
  const end = formatDate(sunday, locale, { day: "numeric", month: "short", year: "numeric" });
  const start = sameMonth
    ? formatDate(monday, locale, { day: "numeric" })
    : formatDate(monday, locale, sameYear ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  return `${start} → ${end}`;
}

/**
 * Name given automatically to a calendar board:
 *   "Elisa30 — Lundi 24 novembre 2026"
 *   "Elisa30 — Semaine 48 · 24 → 30 nov. 2026"
 */
export function periodBoardName(
  parentName: string,
  period: Period,
  start: Date,
  locale: Locale,
  weekLabel: (week: number) => string,
): string {
  return `${parentName}${periodSuffix(period, start, locale, weekLabel)}`;
}

/** The date part of an automatic name: " — Lundi 24 novembre 2026". */
export function periodSuffix(period: Period, start: Date, locale: Locale, weekLabel: (week: number) => string): string {
  const text =
    period === "WEEK" ? `${weekLabel(isoWeek(start).week)} · ${formatWeekRange(start, locale)}` : formatLongDay(start, locale);
  return ` — ${text}`;
}

/**
 * Name of a calendar board moved from `from` to `to`: the date at the end of
 * its automatic name is updated (in the language it was written in), the
 * rest is kept. A name without the automatic date is left unchanged.
 */
export function movedBoardName(
  name: string,
  period: Period,
  from: Date,
  to: Date,
  weekLabels: Record<Locale, (week: number) => string>,
): string {
  for (const locale of Object.keys(weekLabels) as Locale[]) {
    const old = periodSuffix(period, from, locale, weekLabels[locale]);
    if (name.endsWith(old)) return name.slice(0, name.length - old.length) + periodSuffix(period, to, locale, weekLabels[locale]);
  }
  return name;
}
