"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BoardMembers } from "@/components/BoardMembers";
import type { BoardData } from "@/types/api";

export function BoardHeader({
  board,
  isOwner,
  onUpdateName,
  onToggleType,
}: {
  board: BoardData;
  isOwner: boolean;
  onUpdateName: (name: string) => void;
  onToggleType: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);

  async function saveName() {
    setEditing(false);
    const n = name.trim();
    if (n && n !== board.name) await onUpdateName(n);
    else setName(board.name);
  }

  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/boards" className="hover:underline">Tableaux</Link>
          <span>/</span>
        </div>
        {editing && isOwner ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            className="input mt-1 !text-xl !font-semibold"
          />
        ) : (
          <motion.h1
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            onDoubleClick={() => isOwner && setEditing(true)}
            className="mt-1 truncate text-xl font-semibold"
            title={isOwner ? "Double-cliquez pour renommer" : undefined}
          >
            {board.name}
          </motion.h1>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${board.type === "TEAM" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
          {board.type === "TEAM" ? "Équipe" : "Personnel"}
        </span>
        {isOwner && (
          <button onClick={onToggleType} className="btn-ghost text-xs">
            → {board.type === "TEAM" ? "Rendre personnel" : "Partager en équipe"}
          </button>
        )}
        {board.type === "TEAM" && <BoardMembers board={board} isOwner={isOwner} />}
      </div>
    </div>
  );
}