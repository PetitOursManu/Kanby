"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

type Stats = { users: number; boards: number; activeTasks: number; completedTasks: number };
type AdminUser = {
  id: string; email: string; displayName: string; avatarUrl: string | null;
  globalRole: "USER" | "ADMIN"; active: boolean; createdAt: Date;
  _count: { ownedBoards: number };
};
type AdminBoard = {
  id: string; name: string; type: "PERSONAL" | "TEAM"; updatedAt: Date;
  owner: { id: string; displayName: string; email: string };
  _count: { cards: number; members: number };
};

export function AdminPanel({
  users,
  boards,
  stats,
  currentUserId,
}: {
  users: AdminUser[];
  boards: AdminBoard[];
  stats: Stats;
  currentUserId: string;
}) {
  const [userList, setUserList] = useState(users);
  const [showCreate, setShowCreate] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="glass-panel relative overflow-hidden rounded-xl p-6">
        <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-tertiary to-transparent"></div>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-on-surface glow-text">Administration</h1>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-on-surface-variant">Vue d’ensemble de l’instance Kanby</p>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Icon name="person_add" size={16} />
            Créer un utilisateur
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Utilisateurs" value={stats.users} icon="group" />
        <StatCard label="Tableaux" value={stats.boards} icon="view_kanban" />
        <StatCard label="Tâches actives" value={stats.activeTasks} icon="trending_up" />
        <StatCard label="Tâches terminées" value={stats.completedTasks} icon="check_circle" />
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section className="glass-elevated flex flex-col overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-primary/10 bg-primary/5 px-6 py-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-primary glow-text">Utilisateurs</h2>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              {userList.length} total
            </span>
          </div>
          <ul className="divide-y divide-primary/5">
            {userList.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                isSelf={u.id === currentUserId}
                onRemoved={() => setUserList((l) => l.filter((x) => x.id !== u.id))}
              />
            ))}
          </ul>
        </section>

        <section className="glass-elevated flex flex-col overflow-hidden rounded-xl">
          <div className="flex items-center justify-between border-b border-primary/10 bg-primary/5 px-6 py-4">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-primary glow-text">Tous les tableaux</h2>
            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
              {boards.length} total
            </span>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <div className="space-y-3">
              {boards.map((b) => (
                <Link
                  key={b.id}
                  href={`/boards/${b.id}`}
                  className="glass-panel flex items-center justify-between rounded-lg p-4 transition-all hover:border-primary/30 hover:bg-surface/80"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-primary/10 bg-surface-container-high/40 text-on-surface-variant transition-colors">
                      <Icon name="view_kanban" size={20} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-on-surface">{b.name}</h3>
                      <div className="flex items-center gap-2 text-xs text-on-surface-variant">
                        <span className={cn(
                          "rounded border px-2 py-0.5 text-[10px] font-bold uppercase",
                          b.type === "TEAM"
                            ? "border-tertiary/20 bg-tertiary/10 text-tertiary"
                            : "border-primary/20 bg-primary/10 text-primary",
                        )}>
                          {b.type === "TEAM" ? "Équipe" : "Perso"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Icon name="group" size={12} /> {b._count.members}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Propriétaire</p>
                    <p className={cn("text-sm font-medium", b.owner.id === currentUserId ? "text-primary" : "text-on-surface")}>
                      {b.owner.displayName}
                    </p>
                  </div>
                </Link>
              ))}
              {boards.length === 0 && (
                <p className="py-6 text-center text-sm text-on-surface-variant">Aucun tableau.</p>
              )}
            </div>
          </div>
        </section>
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateUserModal
            onClose={() => setShowCreate(false)}
            onCreated={(u) => {
              setUserList((l) => [u, ...l]);
              setShowCreate(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel relative overflow-hidden rounded-xl p-5"
    >
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-[30px]"></div>
      <div className="relative z-10 mb-4 flex h-10 w-10 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
        <Icon name={icon} size={20} />
      </div>
      <p className="relative z-10 text-3xl font-bold tabular-nums text-primary glow-text">{value}</p>
      <p className="relative z-10 mt-1 text-sm font-medium text-on-surface-variant">{label}</p>
    </motion.div>
  );
}

function UserRow({ user, isSelf, onRemoved }: { user: AdminUser; isSelf: boolean; onRemoved: () => void }) {
  const [active, setActive] = useState(user.active);

  async function toggle() {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, active: !active }),
    });
    if (res.ok) setActive(!active);
  }

  async function remove() {
    if (!confirm(`Supprimer le compte de ${user.displayName} ? Cette action est irréversible.`)) return;
    await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    onRemoved();
  }

  return (
    <li className="group flex flex-col gap-4 px-4 py-4 transition-colors hover:bg-primary/5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Avatar name={user.displayName} url={user.avatarUrl} size={40} />
        <div>
          <p className={cn("text-sm font-semibold", isSelf ? "text-primary glow-text" : "text-on-surface")}>
            {user.displayName}
            {isSelf && <span className="ml-2 text-xs text-on-surface-variant">(vous)</span>}
          </p>
          <p className="text-xs text-on-surface-variant">
            {user.email} · {user.globalRole === "ADMIN" ? "Admin" : "Utilisateur"} · {user._count.ownedBoards} tableaux
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span
          className={cn(
            "rounded-full border px-2.5 py-1 text-xs font-medium",
            active
              ? "border-primary/20 bg-primary/10 text-primary"
              : "border-on-surface-variant/20 bg-surface-container text-on-surface-variant",
          )}
        >
          {active ? "Actif" : "Désactivé"}
        </span>

        {!isSelf ? (
          <div className="flex items-center gap-1 opacity-50 transition-opacity group-hover:opacity-100">
            <button
              onClick={toggle}
              className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-primary/10 hover:text-primary"
              title={active ? "Désactiver" : "Activer"}
            >
              <Icon name={active ? "toggle_on" : "toggle_on"} size={18} />
            </button>
            <button
              onClick={remove}
              className="rounded-md p-1.5 text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
              title="Supprimer"
            >
              <Icon name="delete" size={18} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1 opacity-60">
            <Icon name="verified_user" size={18} className="text-primary/50" />
          </div>
        )}
      </div>
    </li>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: AdminUser) => void }) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError("");
    if (!email.trim() || !displayName.trim() || !password) {
      setError("Tous les champs sont requis");
      return;
    }
    if (password.length < 6) {
      setError("Le mot de passe doit faire au moins 6 caractères");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          displayName: displayName.trim(),
          password,
          globalRole: isAdmin ? "ADMIN" : "USER",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Erreur lors de la création");
        return;
      }
      onCreated(data.user);
    } catch {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="glass-elevated w-full max-w-md space-y-4 rounded-t-2xl p-5 md:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-on-surface">Créer un utilisateur</h2>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface">
            <Icon name="close" size={20} />
          </button>
        </div>

        {error && <p className="rounded-lg border border-error/20 bg-error/10 px-3 py-2 text-sm text-error">{error}</p>}

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Nom affiché</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" placeholder="Jean Dupont" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" placeholder="jean@exemple.fr" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-on-surface-variant">Mot de passe</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" placeholder="••••••••" />
          <p className="mt-1 text-xs text-on-surface-variant">L'utilisateur devra le changer à sa première connexion.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            className="h-4 w-4 rounded border-primary/30 bg-surface-container accent-primary"
          />
          Administrateur
        </label>

        <div className="flex gap-2">
          <button onClick={submit} disabled={loading} className="btn-primary flex-1">
            {loading ? "Création…" : "Créer"}
          </button>
          <button onClick={onClose} className="btn-ghost">Annuler</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
