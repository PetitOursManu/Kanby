import type { Locale } from "@/lib/i18n";

const intlLocale = (l: Locale) => (l === "en" ? "en-GB" : "fr-FR");

/**
 * Due dates are calendar days: they are stored at UTC midnight
 * ("2030-01-15" → 2030-01-15T00:00:00Z) and always displayed in UTC so a
 * date never shifts by one day with the viewer's (or server's) timezone.
 */
export function formatDay(iso: string | Date | null | undefined, locale: Locale, opts?: { year?: boolean }): string | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: "numeric",
    month: "short",
    ...(opts?.year ? { year: "numeric" } : {}),
    timeZone: "UTC",
  }).format(d);
}

/** Today's calendar day as YYYY-MM-DD in the viewer's local time. */
export function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The calendar day (YYYY-MM-DD) a stored due date stands for. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toISOString().slice(0, 10);
}

export type DueState = "overdue" | "today" | "soon" | "later";

export function dueState(iso: string | Date | null | undefined, now = new Date()): DueState | null {
  if (!iso) return null;
  const due = dayKey(iso);
  const today = todayKey(now);
  if (due < today) return "overdue";
  if (due === today) return "today";
  const in3 = new Date(now);
  in3.setDate(in3.getDate() + 3);
  return due <= todayKey(in3) ? "soon" : "later";
}

/** Value for <input type="date"> from a stored due date. */
export function toDateInput(iso: string | Date | null | undefined): string {
  return iso ? dayKey(iso) : "";
}

export function formatDateTime(iso: string | Date, locale: Locale): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** "il y a 5 min" / "5 min ago". */
export function timeAgo(iso: string | Date, locale: Locale, now = Date.now()): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const sec = Math.round((d.getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto", style: "short" });
  const abs = Math.abs(sec);
  if (abs < 45) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(sec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(sec / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(sec / 86400), "day");
  return formatDay(d, locale, { year: true }) ?? "";
}
