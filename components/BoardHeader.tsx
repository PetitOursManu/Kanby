"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { BoardMembers } from "@/components/BoardMembers";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
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
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(board.name);

  async function saveName() {
    setEditing(false);
    const n = name.trim();
    if (n && n !== board.name) await onUpdateName(n);
    else setName(board.name);
  }

  return (
    <div className="glass-panel relative mb-4 shrink-0 rounded-xl">
      <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-transparent"></div>

      {/* All content on the LEFT: breadcrumb + title + badges + actions in one row */}
      <div className="flex items-center gap-3 px-3 py-2">
        <Link href="/boards" className="hidden text-xs text-on-surface-variant hover:text-primary hover:underline sm:inline">
          {t("nav.boards")}
        </Link>
        <Icon name="chevron_right" size={12} className="hidden text-on-surface-variant sm:inline" />
        {editing && isOwner ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => e.key === "Enter" && saveName()}
            className="input !text-sm !font-semibold !py-0 !px-1.5 !h-7"
          />
        ) : (
          <motion.h1
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            onDoubleClick={() => isOwner && setEditing(true)}
            className="text-sm font-semibold text-on-surface leading-none"
            title={isOwner ? t("board.doubleClickToRename") : undefined}
          >
            {board.name}
          </motion.h1>
        )}
        <span
          className={cn(
            "rounded-full border px-2 py-0 text-[10px] font-medium h-6 flex items-center",
            board.type === "TEAM"
              ? "border-tertiary/20 bg-tertiary/10 text-tertiary"
              : "border-primary/20 bg-primary/10 text-primary",
          )}
        >
          {board.type === "TEAM" ? t("boards.team") : t("boards.personalFull")}
        </span>
        {isOwner && (
          <button onClick={onToggleType} className="btn-ghost !px-2 !py-0 !h-6 text-[10px]">
            {board.type === "TEAM" ? t("board.makePersonal") : t("board.makeTeam")}
          </button>
        )}
        {board.type === "TEAM" && <BoardMembers board={board} isOwner={isOwner} />}
      </div>
    </div>
  );
}