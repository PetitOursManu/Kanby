"use client";

import { formatDueDate, isOverdue } from "@/lib/utils";
import type { WidgetSummary, WidgetItem } from "@/lib/widget-summary";

export function WidgetViewClient({
  summary,
  displayName,
}: {
  summary: WidgetSummary;
  displayName: string;
}) {
  const { dueToday, overdue, upcoming, counts } = summary;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">K</span>
          <span className="text-sm font-semibold">Kanby</span>
        </div>
        <span className="text-xs text-slate-400 truncate max-w-[8rem]">{displayName}</span>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-2">
        <Counter value={counts.dueToday} label="Aujourd’hui" tone="amber" />
        <Counter value={counts.overdue} label="En retard" tone="rose" />
        <Counter value={counts.totalOpen} label="En cours" tone="brand" />
      </div>

      {/* Lists */}
      <div className="space-y-3">
        {dueToday.length > 0 && (
          <Section title="Aujourd’hui" items={dueToday} accent="#f59e0b" />
        )}
        {overdue.length > 0 && (
          <Section title="En retard" items={overdue} accent="#f43f5e" />
        )}
        {upcoming.length > 0 && (
          <Section title="À venir" items={upcoming} accent="#3380fc" />
        )}
        {dueToday.length === 0 && overdue.length === 0 && upcoming.length === 0 && (
          <p className="rounded-xl bg-white/5 p-4 text-center text-sm text-slate-400">
            Aucune tâche planifiée. 🎉
          </p>
        )}
      </div>
    </div>
  );
}

function Counter({ value, label, tone }: { value: number; label: string; tone: "amber" | "rose" | "brand" }) {
  const colors = {
    amber: "from-amber-500/20 to-amber-500/5 text-amber-300",
    rose: "from-rose-500/20 to-rose-500/5 text-rose-300",
    brand: "from-brand-500/20 to-brand-500/5 text-brand-300",
  }[tone];
  return (
    <div className={`rounded-xl bg-gradient-to-b ${colors} p-2 text-center`}>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[10px] uppercase tracking-wide opacity-80">{label}</p>
    </div>
  );
}

function Section({ title, items, accent }: { title: string; items: WidgetItem[]; accent: string }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
        {title}
      </p>
      <ul className="space-y-1.5">
        {items.map((item) => {
          const due = formatDueDate(item.dueDate);
          const od = isOverdue(item.dueDate);
          return (
            <li key={item.id} className="rounded-lg bg-white/5 p-2">
              <p className="text-sm font-medium leading-snug">{item.title}</p>
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400">
                <span className="truncate">{item.boardName}</span>
                {due && (
                  <span style={{ color: od ? "#f87171" : undefined }} className="ml-2 shrink-0">
                    {due}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}