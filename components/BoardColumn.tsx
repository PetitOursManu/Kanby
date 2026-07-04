"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { motion, AnimatePresence } from "framer-motion";
import { DragTiltCard } from "@/components/DragTiltCard";
import { CardItem } from "@/components/CardItem";
import { Icon } from "@/components/Icon";
import { LABEL_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import type { ColumnRow, CardRow } from "@/types/api";

export function BoardColumn({
  column,
  cards,
  canEdit,
  draggingId,
  onCardClick,
  onAddCard,
  onRenameColumn,
  onDeleteColumn,
  onColorColumn,
}: {
  column: ColumnRow;
  cards: CardRow[];
  canEdit: boolean;
  draggingId: string | null;
  onCardClick: (card: CardRow) => void;
  onAddCard: (columnId: string, title: string) => void;
  onRenameColumn: (columnId: string, name: string) => void;
  onDeleteColumn: (columnId: string) => void;
  onColorColumn: (columnId: string, color: string | null) => void;
}) {
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({ id: column.id });
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(column.name);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorBtnRef = useRef<HTMLButtonElement>(null);
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!showColorPicker) {
      setPickerPos(null);
      return;
    }
    const btn = colorBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const pickerWidth = 176; // w-44
    const pickerHeight = 120; // approx
    const left = Math.min(rect.right - pickerWidth, window.innerWidth - pickerWidth - 8);
    // Open upward if not enough room below, else downward.
    const openUpward = rect.bottom + pickerHeight > window.innerHeight;
    const top = openUpward ? rect.top - pickerHeight - 8 : rect.bottom + 4;
    setPickerPos({ top: Math.max(8, top), left: Math.max(8, left) });
  }, [showColorPicker]);

  // Make the column sortable for horizontal reorder.
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging: colDragging } =
    useSortable({ id: column.id, data: { type: "column" } });

  const { t } = useI18n();

  const doneKinds = column.kind === "DONE";

  async function submitAdd() {
    const t = newTitle.trim();
    if (t) await onAddCard(column.id, t);
    setNewTitle("");
    setAdding(false);
  }

  async function submitRename() {
    const n = name.trim();
    if (n && n !== column.name) await onRenameColumn(column.id, n);
    else setName(column.name);
    setEditingName(false);
  }

  return (
    <div
      id={`col-${column.id}`}
      ref={(node) => {
        setDroppableRef(node);
        setSortableRef(node);
      }}
      style={{
        transform: `translate3d(${transform?.x ?? 0}px, ${transform?.y ?? 0}px, 0)`,
        transition,
      }}
      className={cn(
        "flex h-full w-80 shrink-0 flex-col rounded-xl",
        "glass-panel",
        isOver && "ring-2 ring-primary/40",
        colDragging && "opacity-50",
      )}
    >
      {/* Column header */}
      <div className="glass-panel flex items-center gap-2 rounded-t-xl px-4 py-3">
        {canEdit && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-on-surface-variant transition-colors hover:text-primary"
            title={t("board.moveColumn")}
          >
            <Icon name="drag_handle" size={14} />
          </button>
        )}

        {editingName ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={submitRename}
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
            className="input !py-1 !text-sm font-semibold"
          />
        ) : (
          <button
            onDoubleClick={() => setEditingName(true)}
            onClick={() => canEdit && setEditingName(true)}
            className="flex items-center gap-2 text-sm font-semibold text-on-surface"
            title={t("board.renameColumn")}
          >
            {column.color ? (
              <span
                className="h-3 w-3 rounded-full ring-2 ring-background"
                style={{ backgroundColor: column.color }}
              />
            ) : (
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  doneKinds ? "bg-emerald-500" : column.kind === "DOING" ? "bg-amber-500" : "bg-on-surface-variant",
                )}
              />
            )}
            {column.name}
            <span className="text-xs text-on-surface-variant">{cards?.length ?? 0}</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {canEdit && (
            <div className="relative">
              <button
                ref={colorBtnRef}
                onClick={() => setShowColorPicker((v) => !v)}
                className="rounded-md p-1 text-on-surface-variant transition-colors hover:bg-primary/10 hover:text-primary"
                title={t("board.columnColor")}
              >
                <Icon name="color" size={14} />
              </button>
              {showColorPicker && pickerPos && createPortal(
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setShowColorPicker(false)}
                  />
                  <div
                    className="card-surface fixed z-50 w-44 p-3 shadow-lift"
                    style={{ top: pickerPos.top, left: pickerPos.left }}
                  >
                    <div className="flex flex-wrap gap-2">
                      {LABEL_COLORS.map((c) => (
                        <button
                          key={c.value}
                          onClick={() => {
                            onColorColumn(column.id, c.value);
                            setShowColorPicker(false);
                          }}
                          className={cn(
                            "h-7 w-7 rounded-full ring-2 ring-offset-1",
                            column.color === c.value ? "ring-on-surface" : "ring-transparent",
                          )}
                          style={{ backgroundColor: c.value }}
                          title={c.name}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        onColorColumn(column.id, null);
                        setShowColorPicker(false);
                      }}
                      className="mt-2 w-full rounded-md py-1 text-xs text-on-surface-variant hover:bg-primary/5"
                    >
                      {t("board.removeColor")}
                    </button>
                  </div>
                </>,
                document.body,
              )}
            </div>
          )}
          {canEdit && (
            <button
              onClick={() => onDeleteColumn(column.id)}
              className="rounded-md p-1 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
              title={t("board.deleteColumn")}
            >
              <Icon name="delete" size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        <SortableContext items={(cards ?? []).map((c) => c.id)} strategy={verticalListSortingStrategy}>
          <AnimatePresence>
            {(cards ?? []).map((card) => (
              <DragTiltCard key={card.id} id={card.id} isDragging={draggingId === card.id}>
                <CardItem card={card} onClick={() => onCardClick(card)} />
              </DragTiltCard>
            ))}
          </AnimatePresence>
        </SortableContext>

        {/* Add card */}
        {canEdit && (
          <div className="pt-1">
            {adding ? (
              <div className="glass-elevated rounded-xl p-3">
                <textarea
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAdd(); }
                    if (e.key === "Escape") setAdding(false);
                  }}
                  placeholder={t("board.taskTitlePlaceholder")}
                  className="input min-h-[60px] resize-none"
                />
                <div className="mt-2 flex gap-2">
                  <button onClick={submitAdd} className="btn-primary !py-1.5 text-xs">{t("board.add")}</button>
                  <button onClick={() => setAdding(false)} className="btn-ghost !py-1.5 text-xs">{t("board.cancel")}</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-1.5 rounded-xl px-2 py-2 text-sm text-on-surface-variant transition-colors hover:bg-primary/5 hover:text-primary"
              >
              <Icon name="add" size={14} />
              {t("board.addTask")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
