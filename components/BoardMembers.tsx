"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { BoardData } from "@/types/api";

export function BoardMembers({ board, isOwner }: { board: BoardData; isOwner: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div className="flex -space-x-2">
        {board.members.slice(0, 5).map((m) => (
          <div key={m.userId} className="rounded-full ring-2 ring-background" title={m.user.displayName}>
            <Avatar name={m.user.displayName} url={m.user.avatarUrl} size={26} />
          </div>
        ))}
        {isOwner && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="ml-2 flex h-[26px] w-[26px] items-center justify-center rounded-full border border-primary/30 bg-primary/20 text-primary text-xs transition-colors hover:bg-primary/30"
            title="Inviter"
          >
            <Icon name="add" size={14} />
          </button>
        )}
      </div>

      <AnimatePresence>
        {open && isOwner && (
          <InvitePanel board={board} onClose={() => setOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function InvitePanel({ board, onClose }: { board: BoardData; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; displayName: string; email: string; avatarUrl: string | null }[]>([]);
  const [invited, setInvited] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [onClose]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setResults([]); return; }
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.users);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  async function invite(userId: string) {
    setError(null);
    const res = await fetch(`/api/boards/${board.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (res.ok) {
      setInvited((arr) => [...arr, userId]);
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Erreur");
    }
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      className="glass-elevated absolute right-0 top-9 z-40 w-72 rounded-xl p-3"
    >
      <p className="mb-2 text-sm font-medium text-on-surface">Inviter un membre</p>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Nom ou email…"
        className="input"
      />
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
      <ul className="mt-2 max-h-60 overflow-y-auto">
        {results.map((u) => (
          <li key={u.id}>
            <button
              onClick={() => invite(u.id)}
              disabled={invited.includes(u.id) || board.members.some((m) => m.userId === u.id)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-on-surface transition-colors hover:bg-primary/5 disabled:opacity-50"
            >
              <Avatar name={u.displayName} url={u.avatarUrl} size={26} />
              <span className="min-w-0">
                <span className="block truncate font-medium">{u.displayName}</span>
                <span className="block truncate text-xs text-on-surface-variant">{u.email}</span>
              </span>
              {invited.includes(u.id) && <span className="ml-auto text-xs text-primary">Ajouté</span>}
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && results.length === 0 && (
          <li className="px-2 py-3 text-xs text-on-surface-variant">Aucun utilisateur trouvé.</li>
        )}
      </ul>
    </motion.div>
  );
}
