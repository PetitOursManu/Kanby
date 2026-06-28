"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { motion, AnimatePresence } from "framer-motion";
import { DragTiltCard } from "@/components/DragTiltCard";
import { CardItem } from "@/components/CardItem";
import { LABEL_COLORS } from "@/lib/constants";
import { cn } from "@/lib/utils";
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

  // Make the column sortable for horizontal reorder.
  const { attributes, listeners, setNodeRef: setSortableRef, transform, transition, isDragging: colDragging } =
    useSortable({ id: column.id, data: { type: "column" } });

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
      ref={(node) => {
        setDroppableRef(node);
        setSortableRef(node);
      }}
      style={{
        transform: `translate3d(${transform?.x ?? 0}px, ${transform?.y ?? 0}px, 0)`,
        transition,
      }}
      className={cn(
        "flex w-[86vw] shrink-0 snap-center flex-col rounded-2xl border bg-slate-100/60 dark:bg-slate-800/40 md:w-full md:flex-1",
        isOver && "ring-2 ring-brand-400/60",
        colDragging && "opacity-50",
      )}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 px-3 pt-3">
        {canEdit && (
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab touch-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title="Déplacer la colonne"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01" />
            </svg>
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
            className="flex items-center gap-2 text-sm font-semibold"
            title="Renommer"
          >
            {column.color ? (
              <span
                className="h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-800"
                style={{ backgroundColor: column.color }}
              />
            ) : (
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  doneKinds ? "bg-emerald-500" : column.kind === "DOING" ? "bg-amber-500" : "bg-slate-400",
                )}
              />
            )}
            {column.name}
            <span className="text-xs text-slate-400">{cards?.length ?? 0}</span>
          </button>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {canEdit && (
            <div className="relative">
              <button
                onClick={() => setShowColorPicker((v) => !v)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
                title="Couleur de la colonne"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 2a14.5 14.5 0 0 0 0 20M12 2a14.5 14.5 0 0 1 0 20" />
                </svg>
              </button>
              {showColorPicker && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowColorPicker(false)} />
                  <div className="absolute right-0 top-8 z-40 w-44 card-surface p-3 shadow-lift">
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
                            column.color === c.value ? "ring-slate-900 dark:ring-white" : "ring-transparent",
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
                      className="mt-2 w-full rounded-md py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      Retirer la couleur
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          {canEdit && (
            <button
              onClick={() => onDeleteColumn(column.id)}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-200 hover:text-rose-600 dark:hover:bg-slate-700"
              title="Supprimer la colonne"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
            </button>
          )}
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2" style={{ minHeight: "60vh" }}>
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
              <div className="card-surface p-2">
                <textarea
                  autoFocus
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAdd(); }
                    if (e.key === "Escape") setAdding(false);
                  }}
                  placeholder="Titre de la tâche…"
                  className="input min-h-[60px] resize-none"
                />
                <div className="mt-2 flex gap-2">
                  <button onClick={submitAdd} className="btn-primary !py-1.5 text-xs">Ajouter</button>
                  <button onClick={() => setAdding(false)} className="btn-ghost !py-1.5 text-xs">Annuler</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-1.5 rounded-xl px-2 py-2 text-sm text-slate-500 hover:bg-slate-200/70 dark:hover:bg-slate-700/60"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" /></svg>
                Ajouter une tâche
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}