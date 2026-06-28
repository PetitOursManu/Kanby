"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/Avatar";
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
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Administration</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Vue d'ensemble de l'instance Kanby.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary !py-2 text-sm">
          + Créer un utilisateur
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Utilisateurs" value={stats.users} color="brand" />
        <StatCard label="Tableaux" value={stats.boards} color="violet" />
        <StatCard label="Tâches actives" value={stats.activeTasks} color="amber" />
        <StatCard label="Tâches terminées" value={stats.completedTasks} color="emerald" />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Utilisateurs</h2>
        <div className="card-surface overflow-hidden">
          <ul className="divide-y">
            {userList.map((u) => (
              <UserRow key={u.id} user={u} isSelf={u.id === currentUserId} onRemoved={() => setUserList((l) => l.filter((x) => x.id !== u.id))} />
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Tous les tableaux</h2>
        <div className="card-surface overflow-hidden">
          <ul className="divide-y">
            {boards.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/boards/${b.id}`} className="font-medium hover:underline">{b.name}</Link>
                  <p className="text-xs text-slate-500">
                    {b.type === "TEAM" ? "Équipe" : "Personnel"} · {b._count.cards} tâches · {b._count.members} membres
                  </p>
                </div>
                <span className="text-xs text-slate-500">{b.owner.displayName}</span>
              </li>
            ))}
            {boards.length === 0 && <li className="px-4 py-6 text-sm text-slate-500">Aucun tableau.</li>}
          </ul>
        </div>
      </section>

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

const COLORS: Record<string, string> = {
  brand: "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-200",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
};

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-2xl p-4", COLORS[color])}
    >
      <p className="text-3xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-sm font-medium opacity-80">{label}</p>
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
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar name={user.displayName} url={user.avatarUrl} size={34} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {user.displayName}
          {isSelf && <span className="ml-2 text-xs text-slate-400">(vous)</span>}
        </p>
        <p className="truncate text-xs text-slate-500">
          {user.email} · {user.globalRole === "ADMIN" ? "Admin" : "Utilisateur"} · {user._count.ownedBoards} tableaux
        </p>
      </div>
      <span className={cn("hidden rounded-full px-2 py-0.5 text-xs sm:inline", active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300")}>
        {active ? "Actif" : "Désactivé"}
      </span>
      {!isSelf && (
        <div className="flex gap-1">
          <button onClick={toggle} className="btn-ghost !px-2 !py-1 text-xs">{active ? "Désactiver" : "Activer"}</button>
          <button onClick={remove} className="btn-ghost !px-2 !py-1 text-xs text-rose-600">Supprimer</button>
        </div>
      )}
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
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm md:items-center md:p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        onClick={(e) => e.stopPropagation()}
        className="card-surface w-full max-w-md space-y-4 rounded-t-2xl p-5 md:rounded-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Créer un utilisateur</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">×</button>
        </div>

        {error && <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{error}</p>}

        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Nom affiché</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" placeholder="Jean Dupont" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="input" placeholder="jean@exemple.fr" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Mot de passe</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" className="input" placeholder="••••••••" />
          <p className="mt-1 text-xs text-slate-400">L'utilisateur devra le changer à sa première connexion.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="h-4 w-4 rounded accent-brand-600" />
          Administrateur
        </label>

        <div className="flex gap-2">
          <button onClick={submit} disabled={loading} className="btn-primary flex-1">{loading ? "Création…" : "Créer"}</button>
          <button onClick={onClose} className="btn-ghost">Annuler</button>
        </div>
      </motion.div>
    </motion.div>
  );
}