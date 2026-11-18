"use client";

import { useEffect, useRef, useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowLeft, ArrowRight, Check, GripVertical, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/Menu";
import { SortableCard } from "@/components/board/SortableCard";
import { columnDot } from "@/components/board/LabelChip";
import { LABEL_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import type { CardRow, ColumnRow } from "@/types/api";

type Kind = "TODO" | "DOING" | "DONE";

export type ColumnActions = {
  addCard: (columnId: string, title: string) => Promise<boolean>;
  rename: (columnId: string, name: string) => void;
  setColor: (columnId: string, color: string | null) => void;
  setKind: (columnId: string, kind: Kind) => void;
  move: (columnId: string, delta: -1 | 1) => void;
  remove: (columnId: string) => void;
  openCard: (card: CardRow) => void;
};

export function BoardColumn({
  column,
  cards,
  index,
  count,
  canEdit,
  canDrag,
  isOwner,
  filtered,
  actions,
}: {
  column: ColumnRow;
  cards: CardRow[];
  index: number;
  count: number;
  canEdit: boolean;
  /** False while filtering: positions in a filtered list are ambiguous. */
  canDrag: boolean;
  isOwner: boolean;
  filtered: boolean;
  actions: ColumnActions;
}) {
  const { t } = useI18n();
  const sortable = useSortable({ id: `col:${column.id}`, data: { type: "column" }, disabled: !canDrag });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id, data: { type: "column-body", columnId: column.id } });

  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(column.name);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLUListElement | null>(null);

  useEffect(() => setName(column.name), [column.name]);
  useEffect(() => {
    if (adding) composerRef.current?.focus();
  }, [adding]);

  const done = column.kind === "DONE";

  function commitRename() {
    setRenaming(false);
    const next = name.trim();
    if (next && next !== column.name) actions.rename(column.id, next);
    else setName(column.name);
  }

  async function submitCard() {
    const title = draft.trim();
    if (!title || busy) return;
    setBusy(true);
    const ok = await actions.addCard(column.id, title);
    setBusy(false);
    if (ok) {
      setDraft("");
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
        composerRef.current?.focus();
      });
    }
  }

  return (
    <section
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition }}
      id={`col-${column.id}`}
      aria-label={column.name}
      className={cn(
        "flex max-h-full w-[85vw] max-w-[300px] shrink-0 snap-center flex-col rounded-xl border border-line bg-sunken sm:w-[288px]",
        sortable.isDragging && "opacity-50",
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-2">
        {canDrag && (
          <button
            type="button"
            {...sortable.attributes}
            {...sortable.listeners}
            className="flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-faint hover:text-muted active:cursor-grabbing"
            aria-label={t("board.moveColumn")}
            title={t("board.moveColumn")}
          >
            <GripVertical size={14} />
          </button>
        )}
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: columnDot(column.kind, column.color) }} />
        {renaming ? (
          <input
            autoFocus
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                setName(column.name);
                setRenaming(false);
              }
            }}
            className="input h-7 min-w-0 flex-1 px-2 py-0 text-[13.5px] font-semibold"
            aria-label={t("board.renameColumn")}
          />
        ) : (
          <h2
            className={cn("min-w-0 truncate px-0.5 text-[13.5px] font-semibold text-fg", canEdit && "cursor-text")}
            onClick={() => canEdit && setRenaming(true)}
            title={canEdit ? t("board.clickToRename") : undefined}
          >
            {column.name}
          </h2>
        )}
        {!renaming && (
          <span className="shrink-0 text-xs font-medium tabular-nums text-faint">
            {filtered ? `${cards.length}/${count}` : count}
          </span>
        )}
        {done && !renaming && <Check size={14} className="shrink-0 text-accent" aria-label={t("board.kind.DONE")} />}
        {canEdit && !renaming && (
          <Menu
            label={t("board.columnMenu", { name: column.name })}
            trigger={(p) => (
              <button type="button" {...p} className="icon-btn ml-auto h-7 w-7" aria-label={t("board.columnMenu", { name: column.name })}>
                <MoreHorizontal size={16} />
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<Pencil size={15} />} onClick={() => { close(); setRenaming(true); }}>
                  {t("board.renameColumn")}
                </MenuItem>
                <MenuItem icon={<Plus size={15} />} onClick={() => { close(); setAdding(true); }}>
                  {t("board.addTask")}
                </MenuItem>
                <MenuLabel>{t("board.columnType")}</MenuLabel>
                {(["TODO", "DOING", "DONE"] as Kind[]).map((k) => (
                  <MenuItem key={k} checked={column.kind === k} onClick={() => { close(); if (k !== column.kind) actions.setKind(column.id, k); }}>
                    {t(`board.kind.${k}`)}
                  </MenuItem>
                ))}
                <MenuLabel>{t("board.columnColor")}</MenuLabel>
                <div className="flex flex-wrap gap-1.5 px-2.5 pb-2 pt-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { close(); actions.setColor(column.id, null); }}
                    className={cn("h-6 w-6 rounded-full border-2 border-dashed border-line-strong", !column.color && "ring-2 ring-accent ring-offset-1 ring-offset-surface")}
                    aria-label={t("board.removeColor")}
                    title={t("board.removeColor")}
                  />
                  {LABEL_COLORS.map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      role="menuitem"
                      onClick={() => { close(); actions.setColor(column.id, c.value); }}
                      className={cn("h-6 w-6 rounded-full", column.color === c.value && "ring-2 ring-accent ring-offset-1 ring-offset-surface")}
                      style={{ backgroundColor: c.value }}
                      aria-label={t(`color.${c.key}`)}
                      title={t(`color.${c.key}`)}
                    />
                  ))}
                </div>
                <MenuSeparator />
                <MenuItem icon={<ArrowLeft size={15} />} disabled={index === 0} onClick={() => { close(); actions.move(column.id, -1); }}>
                  {t("board.moveLeft")}
                </MenuItem>
                <MenuItem icon={<ArrowRight size={15} />} onClick={() => { close(); actions.move(column.id, 1); }}>
                  {t("board.moveRight")}
                </MenuItem>
                {isOwner && (
                  <>
                    <MenuSeparator />
                    <MenuItem danger icon={<Trash2 size={15} />} onClick={() => { close(); actions.remove(column.id); }}>
                      {t("board.deleteColumn")}
                    </MenuItem>
                  </>
                )}
              </>
            )}
          </Menu>
        )}
      </div>

      {/* Cards */}
      <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={(el) => {
            setDropRef(el);
            listRef.current = el;
          }}
          className={cn(
            "flex min-h-[3rem] flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-2 pb-1 pt-0.5 transition-colors",
            isOver && cards.length === 0 && "rounded-lg bg-accent-soft/50",
          )}
        >
          {cards.map((card) => (
            <SortableCard key={card.id} card={card} done={done} disabled={!canDrag} onOpen={actions.openCard} />
          ))}
          {cards.length === 0 && !adding && (
            <li className="flex h-12 items-center justify-center rounded-lg border border-dashed border-line-strong text-xs text-faint">
              {filtered ? t("board.noMatch") : t("board.emptyColumn")}
            </li>
          )}
        </ul>
      </SortableContext>

      {/* Composer */}
      {canEdit && (
        <div className="px-2 pb-2 pt-1">
          {adding ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitCard();
              }}
              className="rounded-[10px] border border-line-strong bg-surface p-2 shadow-card"
            >
              <textarea
                ref={composerRef}
                value={draft}
                maxLength={500}
                rows={2}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    submitCard();
                  }
                  if (e.key === "Escape") {
                    setAdding(false);
                    setDraft("");
                  }
                }}
                placeholder={t("board.taskTitlePlaceholder")}
                aria-label={t("board.taskTitlePlaceholder")}
                className="w-full resize-none bg-transparent text-[13.5px] text-fg outline-none placeholder:text-faint"
              />
              <div className="mt-1.5 flex items-center gap-1.5">
                <button type="submit" disabled={!draft.trim() || busy} className="btn-primary btn-sm">
                  {t("board.add")}
                </button>
                <button type="button" onClick={() => { setAdding(false); setDraft(""); }} className="btn-ghost btn-sm">
                  {t("board.cancel")}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] text-muted transition-colors hover:bg-hover hover:text-fg"
            >
              <Plus size={15} /> {t("board.addTask")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
