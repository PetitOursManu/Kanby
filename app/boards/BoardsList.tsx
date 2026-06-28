"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "@/components/Modal";

type BoardItem = {
  id: string;
  name: string;
  type: "PERSONAL" | "TEAM";
  cardsCount: number;
  role: "OWNER" | "MEMBER";
};

export function BoardsList({ owned, member }: { owned: BoardItem[]; member: BoardItem[] }) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mes tableaux</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vos tableaux personnels et d’équipe.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary">
          <PlusIcon /> Nouveau tableau
        </button>
      </div>

      {owned.length > 0 && (
        <Section title="Tableaux personnels & possédés">
          <Grid items={owned} />
        </Section>
      )}

      {member.length > 0 && (
        <Section title="Tableaux d’équipe partagés">
          <Grid items={member} />
        </Section>
      )}

      {owned.length === 0 && member.length === 0 && (
        <div className="card-surface flex flex-col items-center justify-center gap-4 p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/40">
            <PlusIcon />
          </div>
          <div>
            <p className="font-medium">Aucun tableau pour l’instant</p>
            <p className="text-sm text-slate-500">Créez votre premier tableau Kanban.</p>
          </div>
          <button onClick={() => setCreating(true)} className="btn-primary">Créer un tableau</button>
        </div>
      )}

      <CreateBoardModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ items }: { items: BoardItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence>
        {items.map((b) => (
          <motion.div key={b.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
            <Link
              href={`/boards/${b.id}`}
              className="card-surface group block p-4 transition-shadow hover:shadow-lift"
            >
              <div className="flex items-start justify-between">
                <span className="font-medium">{b.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${b.type === "TEAM" ? "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>
                  {b.type === "TEAM" ? "Équipe" : "Perso"}
                </span>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {b.cardsCount} tâche{b.cardsCount > 1 ? "s" : ""} · {b.role === "OWNER" ? "Propriétaire" : "Membre"}
              </p>
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function CreateBoardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"PERSONAL" | "TEAM">("PERSONAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      window.location.href = `/boards/${data.board.id}`;
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Erreur");
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nouveau tableau">
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Nom du tableau</span>
          <input
            autoFocus
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Projet site web"
          />
        </label>

        <div>
          <span className="text-sm font-medium">Type</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["PERSONAL", "TEAM"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${type === t ? "border-brand-500 bg-brand-50 dark:bg-brand-900/30" : "hover:bg-slate-100 dark:hover:bg-slate-800"}`}
              >
                <span className="block font-medium">{t === "PERSONAL" ? "Personnel" : "Équipe"}</span>
                <span className="text-xs text-slate-500">
                  {t === "PERSONAL" ? "Privé, visible par vous seul" : "Partage avec d’autres membres"}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-rose-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">Annuler</button>
          <button onClick={create} disabled={saving || !name.trim()} className="btn-primary">
            {saving ? "Création…" : "Créer"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}