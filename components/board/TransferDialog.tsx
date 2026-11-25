"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Modal } from "@/components/Modal";
import { useI18n } from "@/lib/i18n/client";
import { addDays, dayKey, parseDay, periodStart, type Period } from "@/lib/calendar";
import { todayKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePeriodLabel } from "@/components/board/MoveDateDialog";

/**
 * Default target when transferring tasks out of the board of `date`:
 * today if that day is past, otherwise the next day (or week).
 */
export function defaultTransferDate(period: Period, date: string | null): string {
  const today = todayKey();
  if (!date) return today;
  const start = parseDay(date)!;
  if (period === "WEEK") {
    const thisWeek = dayKey(periodStart("WEEK", parseDay(today)!));
    return date < thisWeek ? today : dayKey(addDays(start, 7));
  }
  return date < today ? today : dayKey(addDays(start, 1));
}

/** Pick a day (or week) to transfer one or several tasks to. */
export function TransferDialog({
  open,
  onClose,
  title,
  period,
  current,
  cards,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  period: Period;
  /** Day / Monday of the board the tasks are on (null for the main board). */
  current: string | null;
  /** When given, the tasks to pick from (all checked by default). */
  cards?: { id: string; title: string }[];
  /** Returns true when done (closes the dialog). */
  onSubmit: (date: string, cardIds?: string[]) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const label = usePeriodLabel();
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setValue(defaultTransferDate(period, current));
    setPicked(new Set(cards?.map((c) => c.id) ?? []));
    // Only when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const target = parseDay(value) ? value : null;
  const same = !!target && !!current && label(period, target) === label(period, current);
  const count = cards ? picked.size : 1;
  const today = todayKey();
  const quick =
    period === "WEEK"
      ? [
          { label: t("transfer.thisWeek"), value: today },
          { label: t("transfer.nextWeek"), value: dayKey(addDays(parseDay(today)!, 7)) },
        ]
      : [
          { label: t("transfer.today"), value: today },
          { label: t("transfer.tomorrow"), value: dayKey(addDays(parseDay(today)!, 1)) },
        ];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || same || count === 0 || loading) return;
    setLoading(true);
    try {
      if (await onSubmit(target, cards ? Array.from(picked) : undefined)) onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="transfer-date" className="label">
            {period === "WEEK" ? t("transfer.toWeek") : t("transfer.toDay")}
          </label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {quick.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => setValue(q.value)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  target && label(period, target) === label(period, q.value)
                    ? "border-accent bg-accent-soft text-accent-fg"
                    : "border-line text-muted hover:bg-hover hover:text-fg",
                )}
              >
                {q.label}
              </button>
            ))}
          </div>
          <input id="transfer-date" type="date" required className="input" value={value} onChange={(e) => setValue(e.target.value)} />
          {target && <p className={cn("mt-1.5 text-sm font-medium", same ? "text-danger" : "text-fg")}>{same ? t("transfer.sameDay") : label(period, target)}</p>}
        </div>

        {cards && (
          <fieldset>
            <div className="mb-1.5 flex items-center justify-between">
              <legend className="label mb-0">{t("transfer.tasks")}</legend>
              {cards.length > 1 && (
                <button
                  type="button"
                  className="text-xs font-medium text-accent-fg hover:underline"
                  onClick={() => setPicked(picked.size === cards.length ? new Set() : new Set(cards.map((c) => c.id)))}
                >
                  {picked.size === cards.length ? t("transfer.noneSelected") : t("transfer.all")}
                </button>
              )}
            </div>
            {cards.length === 0 ? (
              <p className="text-sm text-muted">{t("transfer.none")}</p>
            ) : (
              <ul className="max-h-60 space-y-0.5 overflow-y-auto rounded-lg border border-line p-1">
                {cards.map((c) => {
                  const on = picked.has(c.id);
                  return (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-hover">
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() => {
                            const next = new Set(picked);
                            if (on) next.delete(c.id);
                            else next.add(c.id);
                            setPicked(next);
                          }}
                        />
                        <span
                          aria-hidden
                          className={cn(
                            "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                            on ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                          )}
                        >
                          {on && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span className="min-w-0 text-fg">{c.title}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </fieldset>
        )}

        <p className="text-xs text-muted">{t("transfer.hint")}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t("board.cancel")}
          </button>
          <button type="submit" disabled={loading || !target || same || count === 0} className="btn-primary">
            {cards ? t("transfer.submit", { count }) : t("transfer.submitOne")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
