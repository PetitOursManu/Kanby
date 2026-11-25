"use client";

import { useEffect, useRef, useState } from "react";
import { AlignLeft, CalendarClock, Flag, CalendarDays, Check, CheckSquare, Columns3, Forward, MessageSquare, Plus, Tag, Trash2, UserRound, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { LabelChip } from "@/components/board/LabelChip";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { LABEL_COLORS, PRIORITIES } from "@/lib/constants";
import { api, apiDelete, apiPatch, apiPost } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { dueState, formatDateTime, toDateInput, timeAgo } from "@/lib/format";
import type { CardDetail, CardRow, ColumnRow, CurrentUser } from "@/types/api";
import type { Label } from "@prisma/client";
import { TransferDialog } from "@/components/board/TransferDialog";
import { DateHistoryList } from "@/components/board/DateHistory";
import { usePeriodLabel } from "@/components/board/MoveDateDialog";

type Person = { id: string; displayName: string; avatarUrl: string | null };

/** Turn the detail payload into the row shape the board renders. */
function toRow(d: CardDetail): CardRow {
  const { checklist, comments, column, ...rest } = d;
  void column;
  return {
    ...rest,
    checklist: checklist.map((i) => ({ done: i.done })),
    _count: { checklist: checklist.length, comments: comments.length },
  } as CardRow;
}

export function CardModal({
  boardId,
  transfer = null,
  onTransferred,
  cardId,
  columns,
  labels,
  people,
  canEdit,
  isOwner,
  currentUser,
  onClose,
  onChange,
  onMoved,
  onDeleted,
  onLabelCreated,
}: {
  boardId: string;
  /** Set when the task can be transferred to another day / week of a calendar. */
  transfer?: { period: "DAY" | "WEEK"; date: string | null } | null;
  onTransferred?: (cardId: string, columnId: string) => void;
  cardId: string;
  columns: Pick<ColumnRow, "id" | "name" | "kind">[];
  labels: Label[];
  /** People who can be assigned (board members), empty for personal boards. */
  people: Person[];
  canEdit: boolean;
  isOwner: boolean;
  currentUser: CurrentUser;
  onClose: () => void;
  onChange: (row: CardRow) => void;
  onMoved: (row: CardRow, fromColumnId: string) => void;
  onDeleted: (cardId: string, columnId: string) => void;
  onLabelCreated: (label: Label) => void;
}) {
  const { t, locale } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [card, setCard] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [newItem, setNewItem] = useState("");
  const [comment, setComment] = useState("");
  const [labelDraft, setLabelDraft] = useState<{ name: string; color: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [historyCount, setHistoryCount] = useState(0);
  const periodLabel = usePeriodLabel();
  const titleRef = useRef<HTMLTextAreaElement>(null);
  // Latest card, so async callbacks never write back a stale copy.
  const cardRef = useRef<CardDetail | null>(null);

  useEffect(() => {
    let alive = true;
    setCard(null);
    setError(null);
    api<{ card: CardDetail }>(`/api/cards/${cardId}`)
      .then(({ card }) => {
        if (!alive) return;
        cardRef.current = card;
        setCard(card);
        setTitle(card.title);
        setDescription(card.description ?? "");
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [cardId]);

  // Auto-grow the title field.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [title, card]);

  function update(fn: (current: CardDetail) => CardDetail) {
    const current = cardRef.current;
    if (!current) return;
    const next = fn(current);
    cardRef.current = next;
    setCard(next);
    onChange(toRow(next));
  }

  async function run<T>(key: string, fn: () => Promise<T>): Promise<T | undefined> {
    if (busy === key) return;
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(null);
    }
  }

  async function patch(body: { title?: string; description?: string | null; dueDate?: string | null; priority?: number }) {
    if (!card) return;
    await run(`patch:${Object.keys(body).join(",")}`, async () => {
      const { card: row } = await apiPatch<{ card: CardRow }>(`/api/cards/${card.id}`, body);
      update((c) => ({
        ...c,
        title: row.title,
        description: row.description,
        dueDate: row.dueDate,
        priority: row.priority,
        updatedAt: row.updatedAt,
      }));
    });
  }

  function saveTitle() {
    if (!card) return;
    const next = title.trim();
    if (!next) return setTitle(card.title);
    if (next !== card.title) patch({ title: next });
  }

  function saveDescription() {
    if (!card) return;
    const next = description.trim() ? description : "";
    if (next !== (card.description ?? "")) patch({ description: next || null });
  }

  async function moveTo(columnId: string) {
    if (!card || columnId === card.columnId) return;
    const from = card.columnId;
    await run("move", async () => {
      const { card: row } = await apiPost<{ card: CardRow }>(`/api/cards/${card.id}/move`, { columnId, index: 1e9 });
      const col = columns.find((c) => c.id === columnId)!;
      const next: CardDetail = {
        ...(cardRef.current ?? card),
        columnId: row.columnId,
        order: row.order,
        completedAt: row.completedAt,
        column: { id: col.id, name: col.name, kind: col.kind },
      };
      cardRef.current = next;
      setCard(next);
      onMoved(toRow(next), from);
    });
  }

  async function assign(userId: string | null) {
    if (!card) return;
    await run("assign", async () => {
      const { card: res } = await apiPost<{ card: { assignee: Person | null } }>(`/api/cards/${card.id}/assign`, { userId });
      update((c) => ({ ...c, assignee: res.assignee, assigneeId: res.assignee?.id ?? null }));
    });
  }

  async function toggleLabel(label: Label) {
    if (!card) return;
    await run(`label:${label.id}`, async () => {
      const { attached } = await apiPost<{ attached: boolean }>(`/api/cards/${card.id}/labels`, { labelId: label.id });
      update((c) => ({
        ...c,
        labels: attached ? [...c.labels.filter((l) => l.label.id !== label.id), { label }] : c.labels.filter((l) => l.label.id !== label.id),
      }));
    });
  }

  async function createLabel() {
    if (!card || !labelDraft?.name.trim()) return;
    await run("newLabel", async () => {
      const { label } = await apiPost<{ label: Label }>("/api/labels", {
        boardId: card.boardId,
        name: labelDraft.name.trim(),
        color: labelDraft.color,
      });
      onLabelCreated(label);
      setLabelDraft(null);
      await apiPost(`/api/cards/${card.id}/labels`, { labelId: label.id });
      update((c) => ({ ...c, labels: [...c.labels, { label }] }));
    });
  }

  async function addItem() {
    const text = newItem.trim();
    if (!card || !text) return;
    await run("item", async () => {
      const { item } = await apiPost<{ item: CardDetail["checklist"][number] }>("/api/checklist", { cardId: card.id, text });
      setNewItem("");
      update((c) => ({ ...c, checklist: [...c.checklist, item] }));
    });
  }

  async function toggleItem(id: string, done: boolean) {
    if (!card) return;
    const flip = (value: boolean) => (c: CardDetail) => ({ ...c, checklist: c.checklist.map((i) => (i.id === id ? { ...i, done: value } : i)) });
    update(flip(done));
    try {
      await apiPatch(`/api/checklist/${id}`, { done });
    } catch (e) {
      update(flip(!done));
      toast.error(e);
    }
  }

  async function removeItem(id: string) {
    if (!card) return;
    await run(`item:${id}`, async () => {
      await apiDelete(`/api/checklist/${id}`);
      update((c) => ({ ...c, checklist: c.checklist.filter((i) => i.id !== id) }));
    });
  }

  async function addComment() {
    const text = comment.trim();
    if (!card || !text) return;
    await run("comment", async () => {
      const { comment: c } = await apiPost<{ comment: CardDetail["comments"][number] }>("/api/comments", { cardId: card.id, text });
      setComment("");
      update((cur) => ({ ...cur, comments: [...cur.comments, c] }));
    });
  }

  async function removeComment(id: string) {
    if (!card) return;
    if (!(await confirm({ title: t("card.deleteCommentConfirm"), danger: true, confirm: t("card.delete") }))) return;
    await run(`comment:${id}`, async () => {
      await apiDelete(`/api/comments/${id}`);
      update((cur) => ({ ...cur, comments: cur.comments.filter((c) => c.id !== id) }));
    });
  }

  async function removeCard() {
    if (!card) return;
    const ok = await confirm({ title: t("card.deleteConfirm"), message: card.title, danger: true, confirm: t("card.delete") });
    if (!ok) return;
    await run("delete", async () => {
      await apiDelete(`/api/cards/${card.id}`);
      onDeleted(card.id, card.columnId);
      onClose();
    });
  }

  const done = card?.checklist.filter((i) => i.done).length ?? 0;
  const total = card?.checklist.length ?? 0;
  const state = card && card.column.kind !== "DONE" ? dueState(card.dueDate) : null;

  return (
    <Modal open onClose={onClose} size="xl" title={card ? <span className="sr-only">{card.title}</span> : t("card.title")}>
      {error ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-sm text-muted">{t("card.loadError")}</p>
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("common.close")}
          </button>
        </div>
      ) : !card ? (
        <div className="space-y-3 py-2" aria-busy="true">
          <div className="h-7 w-2/3 animate-pulse rounded-md bg-sunken" />
          <div className="h-24 animate-pulse rounded-lg bg-sunken" />
          <span className="sr-only">{t("card.loading")}</span>
        </div>
      ) : (
        <div className="-mt-3 grid gap-6 md:grid-cols-[minmax(0,1fr)_15rem]">
          {/* ---- Main ---- */}
          <div className="min-w-0 space-y-6">
            <div>
              <textarea
                ref={titleRef}
                value={title}
                rows={1}
                maxLength={500}
                readOnly={!canEdit}
                onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLTextAreaElement).blur();
                  }
                }}
                aria-label={t("card.titleLabel")}
                className="-mx-2 w-[calc(100%+1rem)] resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-2 py-1 text-xl font-semibold leading-snug text-fg outline-none hover:border-line focus:border-accent"
              />
              <p className="mt-1 text-[13px] text-muted">
                {t("card.inColumn")} <span className="font-medium text-fg">{card.column.name}</span>
              </p>
            </div>

            <section>
              <h3 className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-fg">
                <AlignLeft size={15} className="text-muted" /> {t("card.description")}
              </h3>
              <textarea
                value={description}
                rows={4}
                maxLength={20000}
                readOnly={!canEdit}
                onChange={(e) => setDescription(e.target.value)}
                onBlur={saveDescription}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) (e.target as HTMLTextAreaElement).blur();
                }}
                placeholder={canEdit ? t("card.descriptionPlaceholder") : ""}
                className="input min-h-[6rem] resize-y leading-relaxed"
                aria-label={t("card.description")}
              />
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="flex items-center gap-2 text-[13px] font-semibold text-fg">
                  <CheckSquare size={15} className="text-muted" /> {t("card.checklist")}
                </h3>
                {total > 0 && (
                  <span className="text-xs tabular-nums text-muted">
                    {done}/{total}
                  </span>
                )}
              </div>
              {total > 0 && (
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-sunken">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(done / total) * 100}%` }} />
                </div>
              )}
              <ul className="space-y-0.5">
                {card.checklist.map((item) => (
                  <li key={item.id} className="group flex items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-hover">
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={!canEdit}
                      onChange={(e) => toggleItem(item.id, e.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded accent-[rgb(var(--accent))]"
                      aria-label={item.text}
                    />
                    <span className={cn("min-w-0 flex-1 break-words text-sm", item.done ? "text-muted line-through" : "text-fg")}>
                      {item.text}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="icon-btn h-6 w-6 opacity-60 hover:opacity-100 md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100"
                        aria-label={t("card.removeItem", { item: item.text })}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {canEdit && (
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addItem();
                  }}
                >
                  <input
                    value={newItem}
                    maxLength={500}
                    onChange={(e) => setNewItem(e.target.value)}
                    placeholder={t("card.checklistPlaceholder")}
                    aria-label={t("card.checklistPlaceholder")}
                    className="input h-9 py-0"
                  />
                  <button type="submit" disabled={!newItem.trim() || busy === "item"} className="btn-secondary shrink-0" aria-label={t("board.add")}>
                    <Plus size={16} />
                  </button>
                </form>
              )}
            </section>

            <section>
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-fg">
                <MessageSquare size={15} className="text-muted" /> {t("card.comments")}
                {card.comments.length > 0 && <span className="text-xs font-normal text-muted">{card.comments.length}</span>}
              </h3>
              <ul className="space-y-4">
                {card.comments.map((c) => (
                  <li key={c.id} className="group flex gap-3">
                    <Avatar name={c.author.displayName} url={c.author.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-medium text-fg">{c.author.displayName}</span>
                        <time className="text-xs text-faint" dateTime={String(c.createdAt)} title={formatDateTime(c.createdAt, locale)}>
                          {timeAgo(c.createdAt, locale)}
                        </time>
                        {(c.author.id === currentUser.id || isOwner) && (
                          <button
                            type="button"
                            onClick={() => removeComment(c.id)}
                            className="ml-auto text-xs text-faint hover:text-danger md:opacity-0 md:focus:opacity-100 md:group-hover:opacity-100"
                          >
                            {t("card.delete")}
                          </button>
                        )}
                      </div>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-fg">{c.text}</p>
                    </div>
                  </li>
                ))}
              </ul>
              {canEdit && (
                <form
                  className="mt-4 flex gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addComment();
                  }}
                >
                  <Avatar name={currentUser.displayName} url={currentUser.avatarUrl} size={28} />
                  <div className="min-w-0 flex-1">
                    <textarea
                      value={comment}
                      rows={2}
                      maxLength={5000}
                      onChange={(e) => setComment(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          addComment();
                        }
                      }}
                      placeholder={t("card.commentPlaceholder")}
                      aria-label={t("card.commentPlaceholder")}
                      className="input resize-y"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span className="hidden text-xs text-faint sm:inline">{t("card.ctrlEnter")}</span>
                      <button type="submit" disabled={!comment.trim() || busy === "comment"} className="btn-primary btn-sm ml-auto">
                        {t("card.send")}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </section>
          </div>

          {/* ---- Properties ---- */}
          <aside className="space-y-5 md:border-l md:border-line md:pl-6">
            <Field icon={<Columns3 size={14} />} label={t("card.column")}>
              <select
                value={card.columnId}
                disabled={!canEdit || busy === "move"}
                onChange={(e) => moveTo(e.target.value)}
                className="input h-9 py-0"
                aria-label={t("card.column")}
              >
                {columns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field icon={<Flag size={14} />} label={t("priority.label")}>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={t("priority.label")}>
                {[{ value: 0, key: "none", color: null as string | null }, ...PRIORITIES].map((p) => {
                  const on = card.priority === p.value;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={!canEdit || busy === "patch:priority"}
                      onClick={() => !on && patch({ priority: p.value })}
                      title={t(`priority.${p.key}`)}
                      className={cn(
                        "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                        on ? "border-accent bg-accent-soft text-accent-fg" : "border-line text-muted hover:bg-hover hover:text-fg",
                      )}
                    >
                      {p.color ? (
                        <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: p.color }} />
                      ) : (
                        <span className="h-2.5 w-2.5 rounded-[3px] border border-dashed border-line-strong" />
                      )}
                      {t(`priority.${p.key}`)}
                    </button>
                  );
                })}
              </div>
            </Field>

            {people.length > 0 && (
              <Field icon={<UserRound size={14} />} label={t("card.assignedTo")}>
                <div className="flex items-center gap-2">
                  {card.assignee && <Avatar name={card.assignee.displayName} url={card.assignee.avatarUrl} size={24} />}
                  <select
                    value={card.assignee?.id ?? ""}
                    disabled={!canEdit || busy === "assign"}
                    onChange={(e) => assign(e.target.value || null)}
                    className="input h-9 py-0"
                    aria-label={t("card.assignedTo")}
                  >
                    <option value="">{t("card.nobody")}</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName}
                        {p.id === currentUser.id ? ` (${t("card.me")})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
            )}

            <Field icon={<CalendarDays size={14} />} label={t("card.dueDate")}>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={toDateInput(card.dueDate)}
                  disabled={!canEdit}
                  onChange={(e) => patch({ dueDate: e.target.value || null })}
                  className={cn(
                    "input h-9 py-0",
                    state === "overdue" && "border-danger/50 text-danger",
                    state === "today" && "border-warn/50 text-warn",
                  )}
                  aria-label={t("card.dueDate")}
                />
                {card.dueDate && canEdit && (
                  <button type="button" onClick={() => patch({ dueDate: null })} className="icon-btn" aria-label={t("card.clearDueDate")}>
                    <X size={15} />
                  </button>
                )}
              </div>
              {state === "overdue" && <p className="hint text-danger">{t("widget.overdue")}</p>}
            </Field>

            <Field icon={<Tag size={14} />} label={t("card.labels")}>
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => {
                  const on = card.labels.some((x) => x.label.id === l.id);
                  return (
                    <button
                      key={l.id}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => toggleLabel(l)}
                      aria-pressed={on}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md ring-offset-1 ring-offset-surface transition-opacity disabled:cursor-default",
                        on ? "ring-2 ring-accent" : "opacity-55 hover:opacity-100",
                      )}
                    >
                      <LabelChip name={l.name} color={l.color} size="md" />
                    </button>
                  );
                })}
                {labels.length === 0 && !labelDraft && <p className="text-xs text-faint">{t("card.noLabels")}</p>}
              </div>
              {canEdit &&
                (labelDraft ? (
                  <form
                    className="mt-2 space-y-2 rounded-lg border border-line p-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      createLabel();
                    }}
                  >
                    <input
                      autoFocus
                      value={labelDraft.name}
                      maxLength={40}
                      onChange={(e) => setLabelDraft({ ...labelDraft, name: e.target.value })}
                      placeholder={t("card.labelNamePlaceholder")}
                      aria-label={t("card.labelNamePlaceholder")}
                      className="input h-8 py-0 text-[13px]"
                    />
                    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("board.columnColor")}>
                      {LABEL_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          role="radio"
                          aria-checked={labelDraft.color === c.value}
                          aria-label={t(`color.${c.key}`)}
                          title={t(`color.${c.key}`)}
                          onClick={() => setLabelDraft({ ...labelDraft, color: c.value })}
                          className={cn("h-5 w-5 rounded-full", labelDraft.color === c.value && "ring-2 ring-accent ring-offset-1 ring-offset-surface")}
                          style={{ backgroundColor: c.value }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-1.5">
                      <button type="submit" disabled={!labelDraft.name.trim() || busy === "newLabel"} className="btn-primary btn-sm">
                        {t("card.create")}
                      </button>
                      <button type="button" onClick={() => setLabelDraft(null)} className="btn-ghost btn-sm">
                        {t("common.cancel")}
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLabelDraft({ name: "", color: LABEL_COLORS[2].value })}
                    className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent-fg hover:underline"
                  >
                    <Plus size={13} /> {t("card.newLabel")}
                  </button>
                ))}
            </Field>

            <div className="space-y-1 border-t border-line pt-4 text-xs text-faint">
              <p>{t("card.createdOn", { date: formatDateTime(card.createdAt, locale) })}</p>
              {card.completedAt && (
                <p className="flex items-center gap-1 text-accent-fg">
                  <Check size={13} /> {t("card.completedOn", { date: formatDateTime(card.completedAt, locale) })}
                </p>
              )}
            </div>

            {/* Date history of the task (transfers, due date changes). */}
            <div className={historyCount ? "border-t border-line pt-4" : "hidden"}>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                <CalendarClock size={14} /> {t("history.title")}
              </p>
              <DateHistoryList boardId={boardId} cardId={card.id} hideTitle onLoaded={setHistoryCount} reloadKey={card.dueDate} />
            </div>

            {canEdit && transfer && (
              <button
                type="button"
                onClick={() => setTransferOpen(true)}
                className="btn-secondary btn-sm w-full"
                title={transfer.period === "WEEK" ? t("transfer.cardWeek") : t("transfer.card")}
              >
                <Forward size={14} /> {transfer.period === "WEEK" ? t("transfer.cardWeekShort") : t("transfer.cardShort")}
              </button>
            )}

            {canEdit && (
              <button type="button" onClick={removeCard} disabled={busy === "delete"} className="btn-danger btn-sm w-full">
                <Trash2 size={14} /> {t("card.deleteCard")}
              </button>
            )}
          </aside>
        </div>
      )}
      {card && transfer && (
        <TransferDialog
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          title={t("transfer.cardTitle")}
          period={transfer.period}
          current={transfer.date}
          onSubmit={async (date) => {
            try {
              await apiPost(`/api/cards/${card.id}/transfer`, { date });
              toast.success(t("transfer.done", { count: 1, date: periodLabel(transfer.period, date) }));
              onTransferred?.(card.id, card.columnId);
              return true;
            } catch (e) {
              toast.error(e);
              return false;
            }
          }}
        />
      )}
    </Modal>
  );
}

function Field({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
        {icon}
        {label}
      </p>
      {children}
    </div>
  );
}
