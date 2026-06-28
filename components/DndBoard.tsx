"use client";

import { useState } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { BoardColumn } from "@/components/BoardColumn";
import { celebrateDoneDrop } from "@/components/ConfettiOnDoneDrop";
import type { ColumnRow, CardRow } from "@/types/api";
import { prismaPatch } from "@/lib/client-api";

export function DndBoard({
  columns,
  setColumns,
  canEdit,
  onCardClick,
}: {
  columns: ColumnRow[];
  setColumns: React.Dispatch<React.SetStateAction<ColumnRow[]>>;
  canEdit: boolean;
  onCardClick: (card: CardRow, column: ColumnRow) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    // --- Column reordering ---
    if (active.data.current?.type === "column") {
      if (activeId === overId) return;
      const oldIndex = columns.findIndex((c) => c.id === activeId);
      const newIndex = columns.findIndex((c) => c.id === overId);
      if (oldIndex === -1 || newIndex === -1) return;

      const prev = columns;
      // Optimistic reorder.
      setColumns((cols) => {
        const next = [...cols];
        const [moved] = next.splice(oldIndex, 1);
        next.splice(newIndex, 0, moved);
        return next.map((c, i) => ({ ...c, order: i }));
      });

      // Persist new orders for all affected columns.
      try {
        const reordered = [...columns];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);
        await Promise.all(
          reordered.map((c, i) =>
            prismaPatch(`/api/columns/${c.id}`, { order: i }),
          ),
        );
      } catch {
        setColumns(prev);
      }
      return;
    }

    // --- Card drag (within or across columns) ---
    let sourceColumn: ColumnRow | undefined;
    let activeCard: CardRow | undefined;
    for (const c of columns) {
      const found = c.cards.find((card) => card.id === activeId);
      if (found) { sourceColumn = c; activeCard = found; break; }
    }
    if (!sourceColumn || !activeCard) return;

    // `over` may be a column id or a card id. Resolve target column + index.
    let targetColumn: ColumnRow | undefined;
    let targetIndex = 0;
    for (const c of columns) {
      const idx = c.cards.findIndex((card) => card.id === overId);
      if (idx !== -1) { targetColumn = c; targetIndex = idx; break; }
    }
    if (!targetColumn) {
      // over is a column droppable id (e.g. dropped on empty space).
      targetColumn = columns.find((c) => c.id === overId);
      if (!targetColumn) return;
      targetIndex = targetColumn.cards.length;
    }

    const sameColumn = sourceColumn.id === targetColumn.id;
    if (sameColumn && activeCard.id === overId) return; // no movement

    // Optimistic update.
    const prevColumns = columns;
    setColumns((cols) => {
      const next = cols.map((c) => ({ ...c, cards: [...c.cards] }));
      const src = next.find((c) => c.id === sourceColumn!.id)!;
      const dst = next.find((c) => c.id === targetColumn!.id)!;
      src.cards = src.cards.filter((card) => card.id !== activeId);
      // Adjust target index if moving within the same column after removal.
      let idx = targetIndex;
      if (sameColumn && idx > src.cards.length) idx = src.cards.length;
      const moved: CardRow = { ...activeCard!, columnId: dst.id };
      dst.cards.splice(idx, 0, moved);
      // Re-index orders.
      dst.cards = dst.cards.map((card, i) => ({ ...card, order: i }));
      if (!sameColumn) src.cards = src.cards.map((card, i) => ({ ...card, order: i }));
      return next;
    });

    // Persist.
    const wasDone = sourceColumn.kind === "DONE";
    const isDone = targetColumn.kind === "DONE";
    const newOrder = targetIndex;
    try {
      await prismaPatch(`/api/cards/${activeId}`, {
        columnId: targetColumn.id,
        order: newOrder,
      });
      if (isDone && !wasDone) celebrateDoneDrop();
    } catch {
      // Rollback on failure.
      setColumns(prevColumns);
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={columns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
        <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 md:overflow-visible md:gap-4 md:snap-none">
          {columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              cards={column.cards}
              canEdit={canEdit}
              draggingId={draggingId}
              onCardClick={(card) => onCardClick(card, column)}
              onAddCard={addCard}
              onRenameColumn={renameColumn}
              onDeleteColumn={deleteColumn}
              onColorColumn={colorColumn}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );

  async function addCard(columnId: string, title: string) {
    const res = await fetch("/api/cards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ columnId, title }),
    });
    if (!res.ok) return;
    const { card } = await res.json();
    setColumns((cols) =>
      cols.map((c) =>
        c.id === columnId ? { ...c, cards: [...c.cards, card] } : c,
      ),
    );
  }

  async function renameColumn(columnId: string, name: string) {
    setColumns((cols) => cols.map((c) => (c.id === columnId ? { ...c, name } : c)));
    await fetch(`/api/columns/${columnId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async function colorColumn(columnId: string, color: string | null) {
    setColumns((cols) => cols.map((c) => (c.id === columnId ? { ...c, color } : c)));
    await fetch(`/api/columns/${columnId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ color }),
    });
  }

  async function deleteColumn(columnId: string) {
    if (!confirm("Supprimer cette colonne et toutes ses tâches ?")) return;
    setColumns((cols) => cols.filter((c) => c.id !== columnId));
    await fetch(`/api/columns/${columnId}`, { method: "DELETE" });
  }
}