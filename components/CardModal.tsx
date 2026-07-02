"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { LABEL_COLORS } from "@/lib/constants";
import { cn, formatDueDate, isOverdue } from "@/lib/utils";
import { apiPost, apiDelete } from "@/lib/client-api";
import type { BoardData, CardDetail, CurrentUser } from "@/types/api";

type Assignee = { id: string; displayName: string; avatarUrl: string | null };

export function CardModal({
  cardId,
  board,
  currentUser,
  onClose,
  onCardUpdated,
  onCardDeleted,
}: {
  cardId: string;
  board: BoardData;
  currentUser: CurrentUser;
  onClose: () => void;
  onCardUpdated: (card: CardDetail) => void;
  onCardDeleted: (cardId: string) => void;
}) {
  const [card, setCard] = useState<CardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const isTeam = board.type === "TEAM";

  useEffect(() => {
    let alive = true;
    fetch(`/api/cards/${cardId}`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setCard(d.card); setLoading(false); } });
    return () => { alive = false; };
  }, [cardId]);

  async function patch(body: Partial<{
    title: string; description: string | null; dueDate: string | null; columnId: string;
  }>) {
    if (!card) return;
    const res = await fetch(`/api/cards/${card.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const { card: updated } = await res.json();
      setCard((c) => c ? { ...c, ...updated, checklist: c.checklist, comments: c.comments, labels: c.labels, assignee: updated.assignee ?? c.assignee } : c);
    }
  }

  if (loading) {
    return (
      <Modal open onClose={onClose}>
        <p className="text-sm text-on-surface-variant">Chargement…</p>
      </Modal>
    );
  }
  if (!card) return null;

  return (
    <Modal open onClose={onClose} title="Tâche" size="lg">
      <div className="space-y-5">
        {/* Title */}
        <input
          value={card.title}
          onChange={(e) => setCard({ ...card, title: e.target.value })}
          onBlur={() => patch({ title: card.title })}
          className="w-full bg-transparent text-lg font-semibold text-on-surface outline-none placeholder:text-on-surface-variant"
        />

        {/* Meta: due date + column + assignee */}
        <div className="flex flex-wrap gap-3">
          <div>
            <Label>Date d’échéance</Label>
            <input
              type="date"
              value={card.dueDate ? new Date(card.dueDate).toISOString().slice(0, 10) : ""}
              onChange={(e) => {
                const v = e.target.value;
                patch({ dueDate: v ? new Date(v + "T12:00:00").toISOString() : null });
                setCard({ ...card, dueDate: v ? new Date(v + "T12:00:00") : null });
              }}
              className={cn("input !py-1.5 text-sm", card.dueDate && isOverdue(card.dueDate) && !card.completedAt && "border-error")}
            />
          </div>

          <div>
            <Label>Colonne</Label>
            <select
              value={card.column.id}
              onChange={(e) => {
                const col = board.columns.find((c) => c.id === e.target.value)!;
                patch({ columnId: col.id });
                setCard({ ...card, column: { id: col.id, name: col.name, kind: col.kind } });
              }}
              className="input !py-1.5 text-sm"
            >
              {board.columns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {isTeam && (
            <AssigneePicker
              board={board}
              current={card.assignee}
              onChange={async (userId) => {
                await fetch(`/api/cards/${card.id}/assign`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ userId }),
                });
                const member = board.members.find((m) => m.userId === userId)?.user ?? null;
                setCard({ ...card, assignee: member as Assignee | null });
              }}
            />
          )}
        </div>

        {/* Description */}
        <div>
          <Label>Description</Label>
          <textarea
            value={card.description ?? ""}
            onChange={(e) => setCard({ ...card, description: e.target.value })}
            onBlur={() => patch({ description: card.description })}
            placeholder="Ajoutez une description…"
            className="input min-h-[80px] resize-y"
          />
        </div>

        {/* Labels */}
        <LabelsSection card={card} board={board} onChanged={() => refetch()} />

        {/* Checklist */}
        <ChecklistSection card={card} onReload={refetch} />

        {/* Comments (team only) */}
        {isTeam && (
          <CommentsSection card={card} currentUser={currentUser} onReload={refetch} />
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-primary/10 pt-4">
          <span className="text-xs text-on-surface-variant">
            Créée le {new Date(card.createdAt).toLocaleDateString()}
          </span>
          <button
            onClick={async () => {
              if (!confirm("Supprimer cette tâche ?")) return;
              await apiDelete(`/api/cards/${card.id}`);
              onCardDeleted(card.id);
              onClose();
            }}
            className="btn-danger text-xs"
          >
            Supprimer
          </button>
        </div>
      </div>
    </Modal>
  );

  async function refetch() {
    const res = await fetch(`/api/cards/${cardId}`);
    if (res.ok) {
      const d = await res.json();
      setCard(d.card);
      onCardUpdated(d.card);
    }
  }
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{children}</span>;
}

function AssigneePicker({
  board,
  current,
  onChange,
}: {
  board: BoardData;
  current: Assignee | null;
  onChange: (userId: string | null) => void;
}) {
  return (
    <div>
      <Label>Assigné à</Label>
      <select
        value={current?.id ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="input !py-1.5 text-sm"
      >
        <option value="">Personne</option>
        {board.members.map((m) => (
          <option key={m.userId} value={m.userId}>{m.user.displayName}</option>
        ))}
      </select>
      {current && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-on-surface-variant">
          <Avatar name={current.displayName} url={current.avatarUrl} size={16} /> {current.displayName}
        </div>
      )}
    </div>
  );
}

function LabelsSection({
  card,
  board,
  onChanged,
}: {
  card: CardDetail;
  board: BoardData;
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LABEL_COLORS[0].value);

  async function toggle(labelId: string) {
    await apiPost(`/api/cards/${card.id}/labels`, { labelId });
    onChanged();
  }

  async function createLabel() {
    if (!newName.trim()) return;
    const { label } = await apiPost<{ label: { id: string } }>("/api/labels", { boardId: board.id, name: newName, color: newColor });
    // Auto-attach the new label to the current card.
    await apiPost(`/api/cards/${card.id}/labels`, { labelId: label.id });
    setNewName("");
    setCreating(false);
    onChanged();
  }

  return (
    <div>
      <Label>Étiquettes</Label>
      <div className="flex flex-wrap gap-1.5">
        {board.labels.map((label) => {
          const attached = card.labels.some((l) => l.label.id === label.id);
          return (
            <button
              key={label.id}
              onClick={() => toggle(label.id)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition-all",
                attached ? "text-white shadow-glow-sm" : "text-on-surface-variant ring-1 ring-inset hover:scale-105",
              )}
              style={
                attached
                  ? { backgroundColor: label.color }
                  : {
                      color: label.color,
                      borderColor: label.color,
                      boxShadow: `inset 0 0 0 1px ${label.color}50`,
                    }
              }
            >
              {label.name}
            </button>
          );
        })}
        <button
          onClick={() => setCreating((v) => !v)}
          className="rounded-full border border-primary/10 bg-surface-container px-2.5 py-1 text-xs font-medium text-on-surface-variant transition-colors hover:bg-primary/5 hover:text-primary"
        >
          + Étiquette
        </button>
      </div>

      {creating && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 rounded-xl border border-primary/10 p-3"
        >
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom de l’étiquette"
            className="input text-sm"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {LABEL_COLORS.map((c) => (
              <button
                key={c.value}
                onClick={() => setNewColor(c.value)}
                className={cn("h-6 w-6 rounded-full ring-2 ring-offset-1", newColor === c.value ? "ring-on-surface" : "ring-transparent")}
                style={{ backgroundColor: c.value }}
                title={c.name}
              />
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <button onClick={createLabel} className="btn-primary !py-1.5 text-xs">Créer</button>
            <button onClick={() => setCreating(false)} className="btn-ghost !py-1.5 text-xs">Annuler</button>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function ChecklistSection({
  card,
  onReload,
}: {
  card: CardDetail;
  onReload: () => void;
}) {
  const [newText, setNewText] = useState("");

  async function add() {
    if (!newText.trim()) return;
    await apiPost("/api/checklist", { cardId: card.id, text: newText });
    setNewText("");
    onReload();
  }

  async function toggle(id: string, done: boolean) {
    await fetch(`/api/checklist/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: !done }) });
    onReload();
  }

  async function remove(id: string) {
    await apiDelete(`/api/checklist/${id}`);
    onReload();
  }

  const doneCount = card.checklist.filter((i) => i.done).length;

  return (
    <div>
      <Label>Checklist {card.checklist.length > 0 && `(${doneCount}/${card.checklist.length})`}</Label>
      <ul className="space-y-1">
        <AnimatePresence>
          {card.checklist.map((item) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -8 }}
              className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-primary/5"
            >
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => toggle(item.id, item.done)}
                className="h-4 w-4 rounded border-primary/30 bg-surface-container text-primary accent-primary"
              />
              <span className={cn("flex-1 text-sm text-on-surface", item.done && "text-on-surface-variant line-through")}>{item.text}</span>
              <button
                onClick={() => remove(item.id)}
                className="text-xs text-on-surface-variant opacity-0 transition-colors hover:text-error group-hover:opacity-100"
              >
                <Icon name="close" size={14} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="mt-1.5 flex gap-2">
        <input
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Ajouter une sous-tâche…"
          className="input !py-1.5 text-sm"
        />
        <button onClick={add} className="btn-ghost !py-1.5 text-xs shrink-0">Ajouter</button>
      </div>
    </div>
  );
}

function CommentsSection({
  card,
  currentUser,
  onReload,
}: {
  card: CardDetail;
  currentUser: CurrentUser;
  onReload: () => void;
}) {
  const [text, setText] = useState("");

  async function add() {
    if (!text.trim()) return;
    await apiPost("/api/comments", { cardId: card.id, text });
    setText("");
    onReload();
  }

  async function remove(id: string) {
    await apiDelete(`/api/comments/${id}`);
    onReload();
  }

  return (
    <div>
      <Label>Commentaires</Label>
      <ul className="space-y-3">
        <AnimatePresence>
          {card.comments.map((c) => (
            <motion.li
              key={c.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex gap-2.5"
            >
              <Avatar name={c.author.displayName} url={c.author.avatarUrl} size={26} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-on-surface">{c.author.displayName}</span>
                  <span className="text-xs text-on-surface-variant">{new Date(c.createdAt).toLocaleDateString()}</span>
                  {c.author.id === currentUser.id && (
                    <button
                      onClick={() => remove(c.id)}
                      className="ml-auto text-xs text-on-surface-variant transition-colors hover:text-error"
                    >
                      <Icon name="close" size={14} />
                    </button>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-sm text-on-surface-variant">{c.text}</p>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Écrire un commentaire…"
          className="input !py-1.5 text-sm"
        />
        <button onClick={add} className="btn-primary !py-1.5 text-xs shrink-0">Envoyer</button>
      </div>
    </div>
  );
}
