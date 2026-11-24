"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/Modal";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { useI18n } from "@/lib/i18n/client";
import { formatLongDay, formatWeekRange, isoWeek, parseDay, periodStart, type Period } from "@/lib/calendar";
import { rescheduleBoard } from "@/components/board/reschedule";

/** Label of a day / week: "Mardi 24 novembre 2026" / "Semaine 48 · 23 → 29 nov. 2026". */
export function usePeriodLabel() {
  const { t, locale } = useI18n();
  return (period: Period, key: string) => {
    const d = parseDay(key);
    if (!d) return "";
    if (period === "DAY") return formatLongDay(d, locale);
    const monday = periodStart("WEEK", d);
    return `${t("calendar.weekN", { week: isoWeek(monday).week })} · ${formatWeekRange(monday, locale)}`;
  };
}

/** Pick another day (or week) for a board of a calendar. */
export function MoveDateDialog({
  open,
  onClose,
  boardId,
  period,
  date,
  onMoved,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  period: Period;
  /** Current day, or Monday of the current week ("YYYY-MM-DD"). */
  date: string;
  onMoved: (board: { id: string; name: string }) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const label = usePeriodLabel();
  const [value, setValue] = useState(date);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setValue(date);
  }, [open, date]);

  const target = parseDay(value) ? value : null;
  const unchanged = !target || label(period, target) === label(period, date);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || unchanged || loading) return;
    setLoading(true);
    try {
      const done = await rescheduleBoard(boardId, target, () =>
        confirm({ title: t("calendar.swapTitle", { date: label(period, target) }), message: t("calendar.swapHintUnknown"), confirm: t("calendar.swap") }),
      );
      if (done) {
        toast.success(t(done.swapped ? "calendar.swapped" : "calendar.moved", { date: label(period, target) }));
        onMoved(done.board);
        onClose();
      }
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("calendar.moveTitle")} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="move-date" className="label">
            {period === "WEEK" ? t("calendar.moveWeek") : t("calendar.moveDay")}
          </label>
          <input
            id="move-date"
            data-autofocus
            type="date"
            required
            className="input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {target && <p className="mt-1.5 text-sm font-medium text-fg">{label(period, target)}</p>}
        </div>
        <p className="text-xs text-muted">{t("calendar.moveHint")}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t("board.cancel")}
          </button>
          <button type="submit" disabled={loading || unchanged} className="btn-primary">
            {t("calendar.move")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
