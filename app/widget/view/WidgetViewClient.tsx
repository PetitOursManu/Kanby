"use client";

import { LogoMark } from "@/components/Logo";
import { useI18n } from "@/lib/i18n/client";
import { formatDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { WidgetSummary, WidgetItem } from "@/lib/widget-summary";

export function WidgetViewClient({ summary, displayName }: { summary: WidgetSummary; displayName: string }) {
  const { t } = useI18n();
  const { dueToday, overdue, upcoming, counts } = summary;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <LogoMark size={22} />
          <span className="text-sm font-semibold text-fg">Kanby</span>
        </span>
        <span className="max-w-[9rem] truncate text-xs text-muted">{displayName}</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Counter value={counts.dueToday} label={t("widget.today")} tone="text-warn" />
        <Counter value={counts.overdue} label={t("widget.overdue")} tone="text-danger" />
        <Counter value={counts.totalOpen} label={t("widget.inProgress")} tone="text-accent-fg" />
      </div>

      <div className="space-y-3">
        {overdue.length > 0 && <Section title={t("widget.overdue")} items={overdue} dot="bg-danger" />}
        {dueToday.length > 0 && <Section title={t("widget.today")} items={dueToday} dot="bg-warn" />}
        {upcoming.length > 0 && <Section title={t("widget.upcoming")} items={upcoming} dot="bg-accent" />}
        {dueToday.length === 0 && overdue.length === 0 && upcoming.length === 0 && (
          <p className="panel p-4 text-center text-sm text-muted">{t("widget.noTasks")}</p>
        )}
      </div>
    </div>
  );
}

function Counter({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="panel p-2 text-center">
      <p className={cn("text-xl font-semibold tabular-nums", tone)}>{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</p>
    </div>
  );
}

function Section({ title, items, dot }: { title: string; items: WidgetItem[]; dot: string }) {
  const { locale } = useI18n();
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
        <span className={cn("h-1.5 w-1.5 rounded-full", dot)} />
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.id} className="panel flex items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-fg">{item.title}</span>
              <span className="block truncate text-[11px] text-muted">{item.boardName}</span>
            </span>
            <span className="shrink-0 text-[11px] tabular-nums text-muted">{formatDay(item.dueDate, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
