"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  getFirstCollision,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { BoardColumn, type ColumnActions } from "@/components/board/BoardColumn";
import { CardItem } from "@/components/board/CardItem";
import { columnDot } from "@/components/board/LabelChip";
import { celebrateDoneDrop } from "@/components/ConfettiOnDoneDrop";
import { useToast } from "@/components/Toast";
import { apiPatch, apiPost } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import type { CardRow, ColumnRow } from "@/types/api";

const COL = "col:";
const isColId = (id: UniqueIdentifier) => String(id).startsWith(COL);
const stripCol = (id: UniqueIdentifier) => String(id).slice(COL.length);

export function Kanban({
  columns,
  setColumns,
  visible,
  canEdit,
  isOwner,
  actions,
  onAddColumn,
}: {
  columns: ColumnRow[];
  setColumns: React.Dispatch<React.SetStateAction<ColumnRow[]>>;
  /** Card ids that match the current filter, or null when not filtering. */
  visible: Set<string> | null;
  canEdit: boolean;
  isOwner: boolean;
  actions: Omit<ColumnActions, "move">;
  onAddColumn?: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const snapshot = useRef<{ columns: ColumnRow[]; columnId: string; index: number } | null>(null);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  // Dragging is disabled while filtering: positions in a filtered list are ambiguous.
  const dragEnabled = canEdit && !visible;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const findColumn = useCallback((id: UniqueIdentifier): ColumnRow | undefined => {
    const cols = columnsRef.current;
    return cols.find((c) => c.id === id) ?? cols.find((c) => c.cards.some((card) => card.id === id));
  }, []);

  /** Pointer first, then the closest card inside the hovered column. */
  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      if (isColId(args.active.id)) {
        return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => isColId(c.id)) });
      }
      const containers = args.droppableContainers.filter((c) => !isColId(c.id));
      const scoped = { ...args, droppableContainers: containers };
      const hits = pointerWithin(scoped);
      const collisions = hits.length ? hits : rectIntersection(scoped);
      let overId = getFirstCollision(collisions, "id");
      if (overId == null) return [];
      const col = columnsRef.current.find((c) => c.id === overId);
      if (col && col.cards.length) {
        const ids = new Set(col.cards.map((c) => c.id));
        overId = closestCenter({ ...args, droppableContainers: containers.filter((c) => ids.has(String(c.id))) })[0]?.id ?? overId;
      }
      return [{ id: overId }];
    },
    [],
  );

  function onDragStart({ active }: DragStartEvent) {
    setActiveId(active.id);
    if (!isColId(active.id)) {
      const col = findColumn(active.id)!;
      snapshot.current = { columns: columnsRef.current, columnId: col.id, index: col.cards.findIndex((c) => c.id === active.id) };
    } else {
      snapshot.current = { columns: columnsRef.current, columnId: "", index: -1 };
    }
  }

  // Move the card between columns while hovering, so the drop target shows a gap.
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || isColId(active.id)) return;
    const from = findColumn(active.id);
    const to = findColumn(over.id);
    if (!from || !to || from.id === to.id) return;
    setColumns((cols) => {
      const src = cols.find((c) => c.id === from.id)!;
      const dst = cols.find((c) => c.id === to.id)!;
      const card = src.cards.find((c) => c.id === active.id);
      if (!card) return cols;
      const overIndex = dst.cards.findIndex((c) => c.id === over.id);
      const below =
        over.rect && active.rect.current.translated && active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
      const insertAt = overIndex >= 0 ? overIndex + (below ? 1 : 0) : dst.cards.length;
      return cols.map((c) => {
        if (c.id === src.id) return { ...c, cards: c.cards.filter((x) => x.id !== card.id) };
        if (c.id === dst.id) {
          const next = [...c.cards];
          next.splice(insertAt, 0, { ...card, columnId: dst.id });
          return { ...c, cards: next };
        }
        return c;
      });
    });
  }

  async function onDragEnd({ active, over }: DragEndEvent) {
    setActiveId(null);
    const snap = snapshot.current;
    snapshot.current = null;
    if (!snap) return;

    // ---- Column reorder ----
    if (isColId(active.id)) {
      if (!over || active.id === over.id) return;
      const ids = columnsRef.current.map((c) => c.id);
      const from = ids.indexOf(stripCol(active.id));
      const to = ids.indexOf(stripCol(over.id));
      if (from < 0 || to < 0) return;
      setColumns((cols) => arrayMove(cols, from, to).map((c, i) => ({ ...c, order: i })));
      try {
        await apiPatch(`/api/columns/${stripCol(active.id)}`, { order: to });
      } catch (e) {
        setColumns(snap.columns);
        toast.error(e);
      }
      return;
    }

    // ---- Card move ----
    const col = findColumn(active.id);
    if (!over || !col) {
      setColumns(snap.columns);
      return;
    }
    let cards = col.cards;
    const activeIndex = cards.findIndex((c) => c.id === active.id);
    const overIndex = cards.findIndex((c) => c.id === over.id);
    if (overIndex >= 0 && overIndex !== activeIndex) {
      cards = arrayMove(cards, activeIndex, overIndex);
      setColumns((cols) => cols.map((c) => (c.id === col.id ? { ...c, cards } : c)));
    }
    const index = cards.findIndex((c) => c.id === active.id);
    if (col.id === snap.columnId && index === snap.index) return; // nothing moved

    const source = snap.columns.find((c) => c.id === snap.columnId)!;
    const enteringDone = col.kind === "DONE" && source.kind !== "DONE";
    try {
      const { card } = await apiPost<{ card: CardRow }>(`/api/cards/${active.id}/move`, { columnId: col.id, index });
      setColumns((cols) =>
        cols.map((c) => (c.id === col.id ? { ...c, cards: c.cards.map((x) => (x.id === card.id ? { ...x, ...card } : x)) } : c)),
      );
      if (enteringDone) celebrateDoneDrop();
    } catch (e) {
      setColumns(snap.columns);
      toast.error(e);
    }
  }

  function onDragCancel() {
    if (snapshot.current) setColumns(snapshot.current.columns);
    snapshot.current = null;
    setActiveId(null);
  }

  async function moveColumnBy(columnId: string, delta: -1 | 1) {
    const cols = columnsRef.current;
    const from = cols.findIndex((c) => c.id === columnId);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= cols.length) return;
    setColumns(arrayMove(cols, from, to).map((c, i) => ({ ...c, order: i })));
    try {
      await apiPatch(`/api/columns/${columnId}`, { order: to });
    } catch (e) {
      setColumns(cols);
      toast.error(e);
    }
  }

  const columnActions: ColumnActions = useMemo(() => ({ ...actions, move: moveColumnBy }), [actions]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeCard = activeId && !isColId(activeId) ? findColumn(activeId)?.cards.find((c) => c.id === activeId) : null;
  const activeColumn = activeId && isColId(activeId) ? columns.find((c) => c.id === stripCol(activeId)) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
      accessibility={{
        screenReaderInstructions: { draggable: t("board.dragInstructions") },
      }}
    >
      <div
        className={cn(
          "flex h-full items-start gap-3 overflow-x-auto overflow-y-hidden px-4 pb-4 pt-1 md:gap-4 md:px-6",
          !activeId && "snap-x snap-mandatory md:snap-none",
        )}
      >
        <SortableContext items={columns.map((c) => `${COL}${c.id}`)} strategy={horizontalListSortingStrategy}>
          {columns.map((col, i) => {
            const cards = visible ? col.cards.filter((c) => visible.has(c.id)) : col.cards;
            return (
              <BoardColumn
                key={col.id}
                column={col}
                cards={cards}
                index={i}
                count={col.cards.length}
                canEdit={canEdit}
                canDrag={dragEnabled}
                isOwner={isOwner}
                filtered={!!visible}
                actions={columnActions}
              />
            );
          })}
        </SortableContext>
        {onAddColumn && (
          <button
            type="button"
            onClick={onAddColumn}
            className="flex h-11 w-[85vw] max-w-[300px] shrink-0 snap-center items-center justify-center gap-1.5 rounded-xl border border-dashed border-line-strong text-[13px] font-medium text-muted transition-colors hover:bg-surface hover:text-fg sm:w-[288px]"
          >
            <Plus size={15} /> {t("board.addColumn")}
          </button>
        )}
        <div className="w-px shrink-0" aria-hidden="true" />
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
        {activeCard ? (
          <div className="w-[min(85vw,272px)]">
            <CardItem card={activeCard} overlay done={findColumn(activeCard.id)?.kind === "DONE"} />
          </div>
        ) : activeColumn ? (
          <div className="flex w-[288px] items-center gap-2 rounded-xl border border-line-strong bg-sunken px-3 py-3 shadow-pop">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: columnDot(activeColumn.kind, activeColumn.color) }} />
            <span className="text-[13.5px] font-semibold text-fg">{activeColumn.name}</span>
            <span className="text-xs text-faint">{activeColumn.cards.length}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
