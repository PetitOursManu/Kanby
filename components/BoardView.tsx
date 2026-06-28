"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BoardHeader } from "@/components/BoardHeader";
import { DndBoard } from "@/components/DndBoard";
import { CardModal } from "@/components/CardModal";
import { ConfettiOnDoneDrop } from "@/components/ConfettiOnDoneDrop";
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

  // Re-fetch the full board after structural changes (labels/members).
  const liveBoard: BoardData = { ...board, name: boardName, type: boardType, columns, labels, members };

  async function addColumn() {
    const name = prompt("Nom de la colonne");
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
    <div>
      <ConfettiOnDoneDrop />

      <BoardHeader
        board={liveBoard}
        isOwner={isOwner}
        onUpdateName={updateBoardName}
        onToggleType={toggleType}
      />

      <div className="relative">
        <DndBoard
          columns={columns}
          setColumns={setColumns}
          canEdit={canEdit}
          onCardClick={(card) => setSelectedCardId(card.id)}
        />
      </div>

      {canEdit && (
        <button onClick={addColumn} className="btn-ghost mt-4 text-sm">
          + Ajouter une colonne
        </button>
      )}

      <AnimatePresence>
        {selectedCardId && (
          <CardModal
            cardId={selectedCardId}
            board={liveBoard}
            currentUser={currentUser}
            onClose={() => setSelectedCardId(null)}
            onCardUpdated={(updated: CardDetail) => {
              setColumns((cols) =>
                cols.map((c) => ({
                  ...c,
                  cards: c.cards.map((card) =>
                    card.id === updated.id
                      ? {
                          ...card,
                          title: updated.title,
                          dueDate: updated.dueDate,
                          completedAt: updated.completedAt,
                          assignee: updated.assignee,
                          labels: updated.labels,
                          checklist: updated.checklist.map((i) => ({ done: i.done })),
                          _count: {
                            checklist: updated.checklist.length,
                            comments: updated.comments.length,
                          },
                        }
                      : card,
                  ),
                })),
              );
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