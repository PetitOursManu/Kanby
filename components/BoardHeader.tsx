"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BoardMembers } from "@/components/BoardMembers";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
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
    <div className="glass-panel relative mb-4 overflow-hidden rounded-xl p-4">
      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-transparent"></div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Link href="/boards" className="hover:text-primary hover:underline">
              Tableaux
            </Link>
            <Icon name="chevron_right" size={12} className="text-on-surface-variant" />
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
              className="mt-1 truncate text-xl font-semibold text-on-surface"
              title={isOwner ? "Double-cliquez pour renommer" : undefined}
            >
              {board.name}
            </motion.h1>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              board.type === "TEAM"
                ? "border-tertiary/20 bg-tertiary/10 text-tertiary"
                : "border-primary/20 bg-primary/10 text-primary",
            )}
          >
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
    </div>
  );
}
