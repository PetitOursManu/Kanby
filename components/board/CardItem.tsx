"use client";

import { memo } from "react";
import { CalendarDays, MessageSquare } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { LabelChip } from "@/components/board/LabelChip";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { dueState, formatDay } from "@/lib/format";
import { useHydrated } from "@/components/TimeAgo";
import type { CardRow } from "@/types/api";

/** Presentational card (used in columns and in the drag overlay). */
export const CardItem = memo(function CardItem({
  card,
  done,
  overlay,
  dragging,
}: {
  card: CardRow;
  done?: boolean;
  overlay?: boolean;
  dragging?: boolean;
}) {
  const { t, locale } = useI18n();
  const hydrated = useHydrated();
  const total = card._count.checklist;
  const checked = card.checklist.filter((c) => c.done).length;
  // "Overdue / today" depends on the viewer's clock: computed in the browser only.
  const state = done || !hydrated ? null : dueState(card.dueDate);
  const comments = card._count.comments;
  const hasMeta = card.dueDate || total > 0 || comments > 0 || card.assignee;

  return (
    <div
      className={cn(
        "group/card rounded-[10px] border border-line bg-surface p-3 text-left shadow-card transition-[border-color,box-shadow,opacity]",
        "hover:border-line-strong",
        dragging && "opacity-40",
        overlay && "rotate-[2deg] cursor-grabbing border-line-strong shadow-pop",
      )}
    >
      {card.labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {card.labels.map(({ label }) => (
            <LabelChip key={label.id} name={label.name} color={label.color} />
          ))}
        </div>
      )}
      <p className={cn("break-words text-[13.5px] font-medium leading-snug text-fg", done && "text-muted line-through decoration-1")}>
        {card.title}
      </p>
      {hasMeta && (
        <div className="mt-2.5 flex items-center gap-3 text-xs text-muted">
          {card.dueDate && (
            <span
              className={cn(
                "inline-flex items-center gap-1 whitespace-nowrap",
                state === "overdue" && "font-medium text-danger",
                state === "today" && "font-medium text-warn",
              )}
              title={t("card.dueDate")}
            >
              <CalendarDays size={13} />
              {state === "overdue"
                ? t("card.overdueOn", { date: formatDay(card.dueDate, locale) ?? "" })
                : state === "today"
                  ? t("widget.today")
                  : formatDay(card.dueDate, locale)}
            </span>
          )}
          {total > 0 && (
            <span
              className={cn("inline-flex items-center gap-1.5", checked === total && "text-accent-fg")}
              title={t("card.checklistProgress", { done: checked, total })}
            >
              <span className="relative h-1 w-8 overflow-hidden rounded-full bg-line">
                <span className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${(checked / total) * 100}%` }} />
              </span>
              <span className="tabular-nums">
                {checked}/{total}
              </span>
            </span>
          )}
          {comments > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums" title={t("card.comments")}>
              <MessageSquare size={13} />
              {comments}
            </span>
          )}
          {card.assignee && (
            <span className="ml-auto">
              <Avatar name={card.assignee.displayName} url={card.assignee.avatarUrl} size={20} />
            </span>
          )}
        </div>
      )}
    </div>
  );
});
