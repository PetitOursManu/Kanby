"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CalendarDays, CalendarRange, Check, ChevronLeft, ChevronRight, GripVertical, KanbanSquare, Loader2, Plus } from "lucide-react";
import { useToast } from "@/components/Toast";
import { useConfirm } from "@/components/Confirm";
import { rescheduleBoard } from "@/components/board/reschedule";
import { apiPost } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import {
  addDays,
  addMonths,
  dayKey,
  formatDate,
  formatLongDay,
  formatMonth,
  formatWeekRange,
  isoWeek,
  monthGrid,
  parseDay,
  startOfWeek,
  type Period,
} from "@/lib/calendar";
import type { CalendarEntry } from "@/lib/calendar-boards";

type View = "month" | "week";

export function CalendarView({
  boardId,
  boardName,
  view,
  date,
  today,
  entries,
  canEdit,
}: {
  boardId: string;
  boardName: string;
  view: View;
  /** "YYYY-MM-DD" shown (any day of the month / week). */
  date: string;
  today: string;
  entries: CalendarEntry[];
  canEdit: boolean;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, setPending] = useState<string | null>(null);
  // Local copy, so a drag & drop shows at once (the server's answer refreshes it).
  const [items, setItems] = useState(entries);
  useEffect(() => setItems(entries), [entries]);
  const [dragged, setDragged] = useState<CalendarEntry | null>(null);
  const dragging = useRef(false);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const current = parseDay(date)!;
  const byKey = new Map(items.map((e) => [`${e.period}:${e.date}`, e]));
  const entryFor = (period: Period, d: Date) => byKey.get(`${period}:${dayKey(d)}`);

  const href = (v: View, d: Date) => `/boards/${boardId}/calendar?view=${v}&date=${dayKey(d)}`;
  const prev = view === "week" ? addDays(current, -7) : addMonths(current, -1);
  const next = view === "week" ? addDays(current, 7) : addMonths(current, 1);
  const monday = startOfWeek(current);
  const heading =
    view === "week" ? `${t("calendar.weekN", { week: isoWeek(monday).week })} · ${formatWeekRange(monday, locale)}` : formatMonth(current, locale);

  /** Open (or create) the board of a day / week, then go to it. */
  async function open(period: Period, d: Date) {
    const key = `${period}:${dayKey(d)}`;
    if (pending) return;
    setPending(key);
    try {
      const { board } = await apiPost<{ board: { id: string } }>(`/api/boards/${boardId}/calendar`, { period, date: dayKey(d) });
      router.push(`/boards/${board.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e);
      setPending(null);
    }
  }

  const periodLabel = (period: Period, key: string) =>
    period === "WEEK" ? t("calendar.weekN", { week: isoWeek(parseDay(key)!).week }) : formatLongDay(parseDay(key)!, locale);

  /** Move a day / week board to another day / week (swapping with the board already there). */
  async function move(entry: CalendarEntry, target: string) {
    if (entry.date === target) return;
    const askSwap = (name?: string) =>
      confirm({
        title: t("calendar.swapTitle", { date: periodLabel(entry.period, target) }),
        message: name ? t("calendar.swapHint", { name }) : t("calendar.swapHintUnknown"),
        confirm: t("calendar.swap"),
      });
    const other = items.find((e) => e.period === entry.period && e.date === target);
    if (other && !(await askSwap(other.name))) return;

    const before = items;
    setItems((list) =>
      list.map((e) => (e.id === entry.id ? { ...e, date: target } : other && e.id === other.id ? { ...e, date: entry.date } : e)),
    );
    try {
      const done = await rescheduleBoard(entry.id, target, () => askSwap(), !!other);
      if (!done) {
        setItems(before);
        return;
      }
      toast.success(t(done.swapped ? "calendar.swapped" : "calendar.moved", { date: periodLabel(entry.period, target) }));
      router.refresh();
    } catch (e) {
      setItems(before);
      toast.error(e);
    }
  }

  function onDragStart(e: DragStartEvent) {
    dragging.current = true;
    setDragged((e.active.data.current?.entry as CalendarEntry) ?? null);
  }
  function onDragEnd(e: DragEndEvent) {
    setDragged(null);
    // The click that ends a drag must not open the board.
    setTimeout(() => (dragging.current = false), 0);
    const entry = e.active.data.current?.entry as CalendarEntry | undefined;
    const target = e.over?.data.current as { period: Period; date: string } | undefined;
    if (entry && target && target.period === entry.period) void move(entry, target.date);
  }

  const common = { entryFor, open, pending, canEdit, today, wasDragging: () => dragging.current };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-semibold tracking-tight text-fg">{heading}</h2>
          <p className="mt-1 text-sm text-muted">
            {boardName} · <Link href={`/boards/${boardId}`} className="hover:text-fg hover:underline">{t("calendar.mainBoard")}</Link>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-surface p-0.5" role="group" aria-label={t("calendar.view")}>
            {(["month", "week"] as const).map((v) => (
              <Link
                key={v}
                href={href(v, current)}
                aria-current={view === v ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium transition-colors",
                  view === v ? "bg-accent-soft text-accent-fg" : "text-muted hover:text-fg",
                )}
              >
                {v === "month" ? <CalendarDays size={14} /> : <CalendarRange size={14} />}
                {v === "month" ? t("calendar.month") : t("calendar.week")}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Link href={href(view, prev)} className="icon-btn border border-line" aria-label={view === "week" ? t("calendar.prevWeek") : t("calendar.prevMonth")}>
              <ChevronLeft size={16} />
            </Link>
            <Link href={href(view, parseDay(today)!)} className="btn-secondary btn-sm">
              {t("calendar.today")}
            </Link>
            <Link href={href(view, next)} className="icon-btn border border-line" aria-label={view === "week" ? t("calendar.nextWeek") : t("calendar.nextMonth")}>
              <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">{canEdit ? `${t("calendar.hint")} ${t("calendar.dragHint")}` : t("calendar.readOnlyHint")}</p>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setDragged(null);
          setTimeout(() => (dragging.current = false), 0);
        }}
        accessibility={{ screenReaderInstructions: { draggable: t("calendar.dragHint") } }}
      >
        {view === "month" ? <MonthGrid current={current} weekHref={(d) => href("week", d)} {...common} /> : <WeekList monday={monday} {...common} />}
        <DragOverlay dropAnimation={null}>
          {dragged && (
            <div className="flex w-max max-w-[16rem] cursor-grabbing items-center gap-1.5 rounded-lg border border-accent bg-surface px-2.5 py-1.5 text-xs font-medium text-fg shadow-lg">
              <KanbanSquare size={13} className="shrink-0 text-accent-fg" />
              <span className="truncate">{periodLabel(dragged.period, dragged.date)}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {dragged.doneCount}/{dragged.cardsCount}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

type CommonProps = {
  entryFor: (period: Period, d: Date) => CalendarEntry | undefined;
  open: (period: Period, d: Date) => void;
  pending: string | null;
  canEdit: boolean;
  today: string;
  /** True right after a drag: the click that ends it must not open the board. */
  wasDragging: () => boolean;
};

/** A day or a week a board can be dropped on (only a board of the same kind). */
function DropZone({
  period,
  date,
  className,
  overClassName,
  children,
}: {
  period: Period;
  date: string;
  className?: string;
  overClassName: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `${period}:${date}`, data: { period, date } });
  const accepts = (active?.data.current?.entry as CalendarEntry | undefined)?.period === period;
  return (
    <div ref={setNodeRef} className={cn(className, isOver && accepts && overClassName)}>
      {children}
    </div>
  );
}

/** Drag props for a board of the calendar (a link keeps its role and focus). */
function useEntryDrag(entry: CalendarEntry, enabled: boolean) {
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({ id: `board:${entry.id}`, data: { entry }, disabled: !enabled });
  const { role: _role, tabIndex: _tabIndex, ...aria } = attributes;
  return { ref: setNodeRef, props: enabled ? { ...listeners, ...aria } : {}, isDragging };
}

/** The board of a day in the month grid: opens it on click, moves it on drag. */
function DayEntry({ entry, label, canEdit, wasDragging }: { entry: CalendarEntry; label: string; canEdit: boolean; wasDragging: () => boolean }) {
  const { t } = useI18n();
  const drag = useEntryDrag(entry, canEdit);
  return (
    <Link
      ref={drag.ref}
      {...drag.props}
      href={`/boards/${entry.id}`}
      draggable={false}
      onClick={(e) => wasDragging() && e.preventDefault()}
      className={cn(
        "absolute inset-x-1 bottom-1 top-8 flex touch-manipulation select-none flex-col justify-end rounded-md border border-accent/30 bg-accent-soft p-1 text-accent-fg transition-colors [-webkit-touch-callout:none] hover:border-accent sm:p-1.5",
        canEdit && "cursor-grab",
        drag.isDragging && "opacity-40",
      )}
      title={t("calendar.openDay", { date: label })}
      aria-label={t("calendar.openDay", { date: label })}
    >
      <span className="flex items-center gap-1 text-[11px] font-medium">
        <KanbanSquare size={12} className="shrink-0" />
        <span className="hidden tabular-nums sm:inline">
          {entry.cardsCount ? t("calendar.progress", { done: entry.doneCount, total: entry.cardsCount }) : t("calendar.emptyBoard")}
        </span>
      </span>
      {entry.cardsCount > 0 && <Progress entry={entry} className="mt-1 hidden sm:block" />}
    </Link>
  );
}

/** The board of a week, in the week-number column of the month grid. */
function WeekEntry({ entry, week, canEdit, wasDragging }: { entry: CalendarEntry; week: number; canEdit: boolean; wasDragging: () => boolean }) {
  const { t } = useI18n();
  const drag = useEntryDrag(entry, canEdit);
  return (
    <Link
      ref={drag.ref}
      {...drag.props}
      href={`/boards/${entry.id}`}
      draggable={false}
      onClick={(e) => wasDragging() && e.preventDefault()}
      className={cn(
        "flex w-full touch-manipulation select-none flex-col items-center rounded-md bg-accent-soft px-1 py-1 text-[11px] font-semibold text-accent-fg [-webkit-touch-callout:none] hover:bg-accent/20",
        canEdit && "cursor-grab",
        drag.isDragging && "opacity-40",
      )}
      title={t("calendar.openWeek", { week })}
      aria-label={t("calendar.openWeek", { week })}
    >
      {t("calendar.weekShort", { week })}
      <span className="hidden text-[10px] font-medium tabular-nums sm:block">
        {entry.doneCount}/{entry.cardsCount}
      </span>
    </Link>
  );
}

function Progress({ entry, className }: { entry: CalendarEntry; className?: string }) {
  const pct = entry.cardsCount ? Math.round((entry.doneCount / entry.cardsCount) * 100) : 0;
  return (
    <div className={cn("h-1 overflow-hidden rounded-full bg-sunken", className)}>
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- Month view

function MonthGrid({
  current,
  weekHref,
  entryFor,
  open,
  pending,
  canEdit,
  today,
  wasDragging,
}: CommonProps & { current: Date; weekHref: (d: Date) => string }) {
  const { t, locale } = useI18n();
  const weeks = monthGrid(current);
  const month = current.getUTCMonth();
  const dayNames = weeks[0].map((d) => formatDate(d, locale, { weekday: "short" }).replace(".", ""));

  return (
    <div className="panel overflow-hidden p-0">
      <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] border-b border-line bg-sunken/60 text-center text-[11px] font-medium uppercase tracking-wide text-muted sm:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
        <span className="py-2">{t("calendar.weekColumn")}</span>
        {dayNames.map((n) => (
          <span key={n} className="py-2">
            {n}
          </span>
        ))}
      </div>
      {weeks.map((days) => {
        const monday = days[0];
        const { week } = isoWeek(monday);
        const weekEntry = entryFor("WEEK", monday);
        const weekPending = pending === `WEEK:${dayKey(monday)}`;
        return (
          <div key={dayKey(monday)} className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] border-b border-line last:border-b-0 sm:grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]">
            {/* Week number: opens / creates the week's board. */}
            <DropZone
              period="WEEK"
              date={dayKey(monday)}
              className="flex flex-col items-center justify-start gap-1 border-r border-line px-0.5 py-2"
              overClassName="bg-accent-soft/70 ring-2 ring-inset ring-accent"
            >
              {weekEntry ? (
                <WeekEntry entry={weekEntry} week={week} canEdit={canEdit} wasDragging={wasDragging} />
              ) : canEdit ? (
                <button
                  type="button"
                  onClick={() => open("WEEK", monday)}
                  disabled={pending !== null}
                  className="group flex w-full flex-col items-center rounded-md px-1 py-1 text-[11px] font-medium text-faint hover:bg-hover hover:text-fg"
                  title={t("calendar.createWeek", { week })}
                  aria-label={t("calendar.createWeek", { week })}
                >
                  {weekPending ? <Loader2 size={13} className="animate-spin" /> : t("calendar.weekShort", { week })}
                  <Plus size={12} className="hidden opacity-0 group-hover:opacity-100 sm:block" />
                </button>
              ) : (
                <Link href={weekHref(monday)} className="text-[11px] font-medium text-faint hover:text-fg">
                  {t("calendar.weekShort", { week })}
                </Link>
              )}
            </DropZone>

            {days.map((d) => {
              const key = dayKey(d);
              const entry = entryFor("DAY", d);
              const outside = d.getUTCMonth() !== month;
              const isToday = key === today;
              const isPending = pending === `DAY:${key}`;
              const label = formatLongDay(d, locale);
              return (
                <DropZone
                  key={key}
                  period="DAY"
                  date={key}
                  className={cn(
                    "group relative min-h-[4.25rem] border-r border-line p-1 last:border-r-0 sm:min-h-[6.5rem] sm:p-1.5",
                    outside && "bg-sunken/40",
                  )}
                  overClassName="bg-accent-soft/70 ring-2 ring-inset ring-accent"
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums",
                      isToday ? "bg-accent font-semibold text-on-accent" : outside ? "text-faint" : "text-fg",
                    )}
                  >
                    {d.getUTCDate()}
                  </span>

                  {entry ? (
                    <DayEntry entry={entry} label={label} canEdit={canEdit} wasDragging={wasDragging} />
                  ) : canEdit ? (
                    <button
                      type="button"
                      onClick={() => open("DAY", d)}
                      disabled={pending !== null}
                      className={cn(
                        "absolute inset-x-1 bottom-1 top-8 flex items-center justify-center rounded-md border border-dashed border-line text-faint transition-opacity hover:border-accent hover:text-accent-fg",
                        isPending ? "opacity-100" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-60",
                      )}
                      title={t("calendar.createDay", { date: label })}
                      aria-label={t("calendar.createDay", { date: label })}
                    >
                      {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    </button>
                  ) : null}
                </DropZone>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------- Week view

function WeekList({ monday, entryFor, open, pending, canEdit, today }: CommonProps & { monday: Date }) {
  const { t, locale } = useI18n();
  const { week } = isoWeek(monday);
  const weekEntry = entryFor("WEEK", monday);
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i));

  return (
    <div className="space-y-4">
      <BoardTile
        title={t("calendar.weekBoard")}
        subtitle={`${t("calendar.weekN", { week })} · ${formatWeekRange(monday, locale)}`}
        entry={weekEntry}
        canEdit={canEdit}
        pending={pending === `WEEK:${dayKey(monday)}`}
        disabled={pending !== null}
        onCreate={() => open("WEEK", monday)}
        createLabel={t("calendar.createWeek", { week })}
        highlight
      />
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {days.map((d) => {
          const key = dayKey(d);
          const label = formatLongDay(d, locale);
          return (
            <li key={key}>
              <DropZone period="DAY" date={key} className="h-full rounded-xl" overClassName="ring-2 ring-accent ring-offset-2 ring-offset-bg">
              <BoardTile
                movable
                title={formatDate(d, locale, { weekday: "long" }).replace(/^./, (c) => c.toUpperCase())}
                subtitle={formatDate(d, locale, { day: "numeric", month: "long" })}
                isToday={key === today}
                entry={entryFor("DAY", d)}
                canEdit={canEdit}
                pending={pending === `DAY:${key}`}
                disabled={pending !== null}
                onCreate={() => open("DAY", d)}
                createLabel={t("calendar.createDay", { date: label })}
              />
              </DropZone>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Grip used to drag a day's board to another day of the week view. */
function DragHandle({ entry }: { entry: CalendarEntry }) {
  const { t } = useI18n();
  const drag = useEntryDrag(entry, true);
  return (
    <button
      ref={drag.ref}
      {...drag.props}
      type="button"
      className={cn(
        "-mr-1 -mt-0.5 flex h-7 w-6 shrink-0 cursor-grab touch-none select-none items-center justify-center rounded text-faint hover:bg-hover hover:text-fg",
        drag.isDragging && "opacity-40",
      )}
      title={t("calendar.dragHandle")}
      aria-label={t("calendar.dragHandle")}
    >
      <GripVertical size={15} />
    </button>
  );
}

function BoardTile({
  title,
  subtitle,
  entry,
  canEdit,
  pending,
  disabled,
  onCreate,
  createLabel,
  isToday,
  highlight,
  movable,
}: {
  title: string;
  subtitle: string;
  entry?: CalendarEntry;
  canEdit: boolean;
  pending: boolean;
  disabled: boolean;
  onCreate: () => void;
  createLabel: string;
  isToday?: boolean;
  highlight?: boolean;
  /** Show a handle to drag the board to another day. */
  movable?: boolean;
}) {
  const { t } = useI18n();
  const more = entry ? entry.cardsCount - entry.cards.length : 0;
  return (
    <div
      className={cn(
        "flex h-full flex-col rounded-xl border bg-surface p-3 shadow-card",
        isToday ? "border-accent" : "border-line",
        highlight && "bg-accent-soft/40",
      )}
    >
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-sm font-semibold", isToday ? "text-accent-fg" : "text-fg")}>{title}</p>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        {movable && entry && canEdit && <DragHandle entry={entry} />}
      </div>

      {entry ? (
        <>
          <div className="mt-2 flex items-center gap-2">
            <Progress entry={entry} className="flex-1" />
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted">
              {entry.doneCount}/{entry.cardsCount}
            </span>
          </div>
          <ul className="mt-2 flex-1 space-y-1">
            {entry.cards.length === 0 && <li className="text-xs text-faint">{t("calendar.emptyBoard")}</li>}
            {entry.cards.map((c) => (
              <li key={c.id} className="flex items-start gap-1.5 text-xs">
                <span
                  className={cn(
                    "mt-0.5 flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border",
                    c.done ? "border-accent bg-accent text-on-accent" : "border-line-strong",
                  )}
                >
                  {c.done && <Check size={9} strokeWidth={3} />}
                </span>
                <span className={cn("line-clamp-2", c.done ? "text-faint line-through" : "text-fg")}>{c.title}</span>
              </li>
            ))}
            {more > 0 && <li className="text-xs text-muted">{t("calendar.moreCards", { count: more })}</li>}
          </ul>
          <Link href={`/boards/${entry.id}`} className="btn-secondary btn-sm mt-3 justify-center">
            <KanbanSquare size={14} /> {t("calendar.openBoard")}
          </Link>
        </>
      ) : (
        <div className="mt-2 flex flex-1 flex-col justify-end">
          <p className="mb-2 text-xs text-faint">{t("calendar.noBoard")}</p>
          {canEdit && (
            <button type="button" onClick={onCreate} disabled={disabled} className="btn-secondary btn-sm justify-center" aria-label={createLabel}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} {t("calendar.new")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
