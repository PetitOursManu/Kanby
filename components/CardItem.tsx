"use client";

import { motion } from "framer-motion";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
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
        "glass-elevated w-full cursor-grab rounded-xl p-3 text-left active:cursor-grabbing",
        "hover:border-primary/30 hover:shadow-glow-sm",
        card.completedAt && "opacity-60",
      )}
    >
      {/* Label chips */}
      {(card.labels?.length ?? 0) > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(card.labels ?? []).map(({ label }) => (
            <span
              key={label.id}
              className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
              style={{
                backgroundColor: `${label.color}20`,
                borderColor: `${label.color}40`,
                color: label.color,
              }}
              title={label.name}
            >
              {label.name}
            </span>
          ))}
        </div>
      )}

      <p className={cn("text-sm font-medium leading-snug text-on-surface", card.completedAt && "line-through")}>
        {card.title}
      </p>

      {(due || card.assignee || checklistCount > 0) && (
        <div className="mt-2 flex items-center gap-2 text-xs text-on-surface-variant">
          {due && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
                overdue
                  ? "border-error/30 bg-error/10 text-error"
                  : "border-primary/10 bg-surface-container-high/40",
              )}
            >
              <Icon name="calendar" size={11} />
              {due}
            </span>
          )}
          {checklistCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <Icon name="checklist" size={11} />
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
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-surface-container">
          <motion.div
            className={cn("h-full rounded-full", checklistDone === checklistCount ? "bg-primary shadow-glow-sm" : "bg-primary/70")}
            initial={{ width: 0 }}
            animate={{ width: `${(checklistDone / checklistCount) * 100}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }}
          />
        </div>
      )}
    </motion.button>
  );
}
