import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes without conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format an ISO date string as a short human date. */
export function formatDueDate(iso: string | Date | null | undefined): string | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** True if the given date is before the start of today. */
export function isOverdue(iso: string | Date | null | undefined): boolean {
  if (!iso) return false;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  return d.getTime() < startOfToday.getTime();
}

/** True if the given date falls within today (00:00 → 23:59:59). */
export function isDueToday(iso: string | Date | null | undefined): boolean {
  if (!iso) return false;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

/** Initials from a display name, max 2 chars. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable color from a string (used for avatar fallbacks). */
export function colorFromString(str: string): string {
  const colors = [
    "#3380fc", "#8b5cf6", "#ec4899", "#10b981",
    "#f59e0b", "#f43f5e", "#06b6d4", "#6366f1",
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash << 5) - hash + str.charCodeAt(i);
  return colors[Math.abs(hash) % colors.length];
}