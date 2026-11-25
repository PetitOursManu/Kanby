"use client";

import { priorityOf } from "@/lib/constants";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

/** Small colored square showing a task's importance (nothing for "none"). */
export function PriorityDot({ value, size = 10, className }: { value: number; size?: number; className?: string }) {
  const { t } = useI18n();
  const p = priorityOf(value);
  if (!p) return null;
  const label = t("priority.title", { name: t(`priority.${p.key}`) });
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={cn("inline-block shrink-0 rounded-[3px]", className)}
      style={{ width: size, height: size, backgroundColor: p.color }}
    />
  );
}
