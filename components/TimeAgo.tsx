"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";
import { formatDateTime, timeAgo } from "@/lib/format";

const subscribe = () => () => {};
/** False during SSR and hydration, true afterwards (no hydration mismatch). */
export function useHydrated() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/**
 * Relative time ("il y a 5 min"). Rendered from the server value first, then
 * refreshed on the client every minute — the server and the browser may not
 * agree on "now" or on the timezone, so the text is not hydration-checked.
 */
export function TimeAgo({ date, className, prefix }: { date: string | Date; className?: string; prefix?: (s: string) => string }) {
  const { locale } = useI18n();
  const [, tick] = useState(0);
  useEffect(() => {
    tick((n) => n + 1);
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const text = timeAgo(date, locale);
  return (
    <time dateTime={new Date(date).toISOString()} title={formatDateTime(date, locale)} className={className} suppressHydrationWarning>
      {prefix ? prefix(text) : text}
    </time>
  );
}
