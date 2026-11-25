"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarClock, CalendarDays, KanbanSquare, ListTodo } from "lucide-react";
import { Modal } from "@/components/Modal";
import { TimeAgo } from "@/components/TimeAgo";
import { api } from "@/lib/client-api";
import { useI18n } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { formatDate, isoWeek, parseDay } from "@/lib/calendar";
import type { HistoryItem } from "@/lib/date-history";

/** Date changes of a board (its calendar, or one day) or of one task. */
export function DateHistoryList({
  boardId,
  cardId,
  hideTitle,
  onLoaded,
  reloadKey,
}: {
  boardId: string;
  cardId?: string;
  /** In a task's history the task title is not repeated. */
  hideTitle?: boolean;
  onLoaded?: (count: number) => void;
  /** Change it to load again. */
  reloadKey?: unknown;
}) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const q = cardId ? `?cardId=${encodeURIComponent(cardId)}` : "";
    api<{ items: HistoryItem[] }>(`/api/boards/${boardId}/history${q}`)
      .then(({ items }) => {
        if (!alive) return;
        setItems(items);
        onLoaded?.(items.length);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, cardId, reloadKey]);

  const when = (item: HistoryItem, key: string | null) => {
    if (!key) return item.kind === "DUE_DATE" ? t("history.noDue") : t("history.mainBoard");
    const d = parseDay(key)!;
    if (item.period === "WEEK") return t("calendar.weekShort", { week: isoWeek(d).week });
    const sameYear = d.getUTCFullYear() === new Date().getFullYear();
    return formatDate(d, locale, item.kind === "DUE_DATE"
      ? { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) }
      : { weekday: "short", day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
  };

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!items) return <p className="text-sm text-muted">{t("history.loading")}</p>;
  if (!items.length) return <p className="text-sm text-muted">{t("history.empty")}</p>;

  return (
    <ol className="space-y-2.5">
      {items.map((item) => {
        const Icon = item.kind === "CARD_MOVED" ? ListTodo : item.kind === "BOARD_MOVED" ? KanbanSquare : CalendarClock;
        return (
          <li key={item.id} className="flex gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-sunken text-muted">
              <Icon size={13} />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-xs font-medium text-muted">
                {t(`history.kind.${item.kind}`)}
                {!hideTitle && <span className="font-semibold text-fg"> · {item.title}</span>}
              </p>
              <p className={cn("mt-0.5 flex flex-wrap items-center gap-x-1.5 text-fg", hideTitle && "text-[13px]")}>
                <span className="whitespace-nowrap first-letter:uppercase">{when(item, item.from)}</span>
                <ArrowRight size={13} className="shrink-0 text-faint" />
                <span className="whitespace-nowrap font-medium first-letter:uppercase">{when(item, item.to)}</span>
              </p>
              <p className="mt-0.5 text-xs text-faint">
                {item.actor && <>{t("history.by", { name: item.actor.displayName })} · </>}
                <TimeAgo date={item.createdAt} />
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function DateHistoryDialog({ open, onClose, boardId }: { open: boolean; onClose: () => void; boardId: string }) {
  const { t } = useI18n();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span className="flex items-center gap-2">
          <CalendarDays size={17} className="text-accent-fg" /> {t("history.title")}
        </span>
      }
    >
      <p className="-mt-1 mb-4 text-xs text-muted">{t("history.hint")}</p>
      {open && <DateHistoryList boardId={boardId} />}
    </Modal>
  );
}
