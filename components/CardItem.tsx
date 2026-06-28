"use client";

import { motion } from "framer-motion";
import { Avatar } from "@/components/Avatar";
import { cn, formatDueDate, isOverdue } from "@/lib/utils";
import type { CardRow } from "@/types/api";

export function CardItem({ card, onClick }: { card: CardRow; onClick: () => void }) {
  const due = formatDueDate(card.dueDate);
  const overdue = isOverdue(card.dueDate) && !card.completedAt;
  const checklistCount = card._count?.checklist ?? 0;
  const checklistDone = (card.checklist ?? []).filter((i) => i.done).length;

  return (
    <motion.button
      layout
      layoutId={`card-${card.id}`}
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 400, damping: 28 }}
      className={cn(
        "card-surface w-full text-left p-3 cursor-grab active:cursor-grabbing",
        "hover:shadow-lift",
        card.completedAt && "opacity-60",
      )}
    >
      {/* Label chips */}
      {(card.labels?.length ?? 0) > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1">
          {(card.labels ?? []).map(({ label }) => (
            <span
              key={label.id}
              className="h-1.5 w-6 rounded-full"
              style={{ backgroundColor: label.color }}
              title={label.name}
            />
          ))}
        </div>
      )}

      <p className={cn("text-sm font-medium leading-snug", card.completedAt && "line-through")}>
        {card.title}
      </p>

      {(due || card.assignee || checklistCount > 0) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
          {due && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
                overdue
                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300"
                  : "bg-slate-100 dark:bg-slate-800",
              )}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              {due}
            </span>
          )}
          {checklistCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
              {checklistDone}/{checklistCount}
            </span>
          )}
          {card.assignee && (
            <span className="ml-auto">
              <Avatar name={card.assignee.displayName} url={card.assignee.avatarUrl} size={18} />
            </span>
          )}
        </div>
      )}

      {/* Checklist progress bar */}
      {checklistCount > 0 && (
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
          <motion.div
            className={cn("h-full rounded-full", checklistDone === checklistCount ? "bg-emerald-500" : "bg-brand-500")}
            initial={{ width: 0 }}
            animate={{ width: `${(checklistDone / checklistCount) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          />
        </div>
      )}
    </motion.button>
  );
}