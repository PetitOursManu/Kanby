"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BoardHeader } from "@/components/BoardHeader";
import { DndBoard } from "@/components/DndBoard";
import { CardModal } from "@/components/CardModal";
import { ConfettiOnDoneDrop } from "@/components/ConfettiOnDoneDrop";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { apiPost } from "@/lib/client-api";
import type { BoardData, CardRow, ColumnRow, CurrentUser, CardDetail } from "@/types/api";

export function BoardView({
  board,
  currentUser,
  isOwner,
  canEdit,
}: {
  board: BoardData;
  currentUser: CurrentUser;
  isOwner: boolean;
  canEdit: boolean;
}) {
  const [columns, setColumns] = useState<ColumnRow[]>(board.columns);
  const [labels, setLabels] = useState(board.labels);
  const [members] = useState(board.members);
  const [boardName, setBoardName] = useState(board.name);
  const [boardType, setBoardType] = useState(board.type);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const { t } = useI18n();

  // Re-fetch the full board after structural changes (labels/members).
  const liveBoard: BoardData = { ...board, name: boardName, type: boardType, columns, labels, members };

  async function addColumn() {
    const name = prompt(t("board.columnNamePrompt"));
    if (!name?.trim()) return;
    const { column } = await apiPost<{ column: ColumnRow }>("/api/columns", {
      boardId: board.id,
      name: name.trim(),
      kind: "TODO",
    });
    setColumns((c) => [...c, { ...column, cards: column.cards ?? [] }]);
  }

  async function updateBoardName(name: string) {
    setBoardName(name);
    await fetch(`/api/boards/${board.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
  }

  async function toggleType() {
    const next = boardType === "TEAM" ? "PERSONAL" : "TEAM";
    setBoardType(next);
    await fetch(`/api/boards/${board.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: next }),
    });
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col overflow-hidden px-4 pb-4 md:px-6">
      <ConfettiOnDoneDrop />

      <div className="flex shrink-0 flex-col">
        <BoardHeader
          board={liveBoard}
          isOwner={isOwner}
          onUpdateName={updateBoardName}
          onToggleType={toggleType}
        />

        {/* Column quick-nav */}
        {columns.length > 0 && (
          <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {columns.map((col) => (
              <button
                key={col.id}
                onClick={() =>
                  document
                    .getElementById(`col-${col.id}`)
                    ?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
                }
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/10 bg-surface/40 px-3 py-1 text-xs font-medium text-on-surface-variant transition-colors hover:border-primary/30 hover:bg-primary/10 hover:text-primary"
                title={t("board.goTo", { name: col.name })}
              >
                {col.color ? (
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: col.color }}
                  />
                ) : (
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      col.kind === "DONE"
                        ? "bg-emerald-500"
                        : col.kind === "DOING"
                          ? "bg-amber-500"
                          : "bg-on-surface-variant",
                    )}
                  />
                )}
                {col.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        <DndBoard
          columns={columns}
          setColumns={setColumns}
          canEdit={canEdit}
          onCardClick={(card) => setSelectedCardId(card.id)}
          onAddColumn={canEdit ? addColumn : undefined}
        />
      </div>

      <AnimatePresence>
        {selectedCardId && (
          <CardModal
            cardId={selectedCardId}
            board={liveBoard}
            currentUser={currentUser}
            onClose={() => setSelectedCardId(null)}
            onCardUpdated={(updated: CardDetail) => {
              setColumns((cols) => {
                // Remove the card from its current column (wherever it is).
                const withoutCard = cols.map((c) => ({
                  ...c,
                  cards: c.cards.filter((card) => card.id !== updated.id),
                }));
                // Find the target column from the updated card's column id.
                const targetCol = withoutCard.find((c) => c.id === updated.column.id);
                if (!targetCol) return withoutCard;

                const updatedRow: CardRow = {
                  ...updated,
                  labels: updated.labels,
                  assignee: updated.assignee,
                  checklist: updated.checklist.map((i) => ({ done: i.done })),
                  _count: {
                    checklist: updated.checklist.length,
                    comments: updated.comments.length,
                  },
                  boardId: targetCol.boardId,
                  columnId: targetCol.id,
                };
                // Append to the end of the target column and re-index.
                const newCards = [...targetCol.cards, updatedRow].map((card, i) => ({
                  ...card,
                  order: i,
                }));
                return withoutCard.map((c) =>
                  c.id === targetCol.id ? { ...c, cards: newCards } : c,
                );
              });
            }}
            onCardDeleted={(cardId) => {
              setColumns((cols) =>
                cols.map((c) => ({ ...c, cards: c.cards.filter((card) => card.id !== cardId) })),
              );
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
