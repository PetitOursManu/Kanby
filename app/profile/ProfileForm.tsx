"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";

type Props = {
  user: {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    globalRole: "USER" | "ADMIN";
    mustChangePwd: boolean;
  };
  mustChangeBanner: boolean;
};

export function ProfileForm({ user, mustChangeBanner }: Props) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-on-surface">Profil</h1>
        <p className="text-sm text-on-surface-variant">Gérez votre identité, votre mot de passe et vos tokens d’API.</p>
      </div>

      <AnimatePresence>
        {mustChangeBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
          >
            Pour des raisons de sécurité, veuillez changer votre mot de passe.
          </motion.div>
        )}
      </AnimatePresence>

      <IdentityCard user={user} />
      <PasswordCard mustChange={user.mustChangePwd} />
      <TokensCard />
    </div>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass-elevated rounded-2xl p-6 md:p-8">
      <div className="mb-6 border-b border-primary/10 pb-4">
        <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
        {description && <p className="mt-1 text-sm text-on-surface-variant">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function IdentityCard({ user }: { user: Props["user"] }) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/me/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        avatarUrl: avatarUrl.trim() || null,
      }),
    });
    setSaving(false);
    setMsg(res.ok ? "Enregistré" : "Erreur lors de l’enregistrement");
  }

  return (
    <Card title="Identité" description="Nom affiché et avatar.">
      <div className="flex flex-col items-start gap-6 md:flex-row">
        <div className="flex flex-col items-center gap-4">
          <div className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-primary/30 bg-primary/20 text-3xl font-bold tracking-wider text-primary shadow-glow-sm">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="relative z-10">{initials(displayName)}</span>
            )}
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100">
              <Icon name="edit" size={24} className="text-white" />
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4">
          <label className="block">
            <span className="text-sm font-medium text-on-surface-variant">Nom affiché</span>
            <input
              className="input mt-1"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-on-surface-variant">URL d’avatar (optionnel)</span>
            <input
              className="input mt-1"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <div className="flex items-center gap-4">
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <span className="text-sm text-on-surface-variant">
              {user.email} · {user.globalRole === "ADMIN" ? "Administrateur" : "Utilisateur"}
            </span>
            {msg && <span className="text-sm text-primary">{msg}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PasswordCard({ mustChange }: { mustChange: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg("Mot de passe mis à jour");
      setCurrent("");
      setNext("");
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || "Erreur");
    }
  }

  return (
    <Card title="Mot de passe" description="Choisissez un mot de passe d’au moins 8 caractères.">
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Mot de passe actuel"
          className="input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Nouveau mot de passe"
          className="input"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        <div className="flex items-center gap-4 md:col-span-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "…" : "Changer le mot de passe"}
          </button>
          {mustChange && <span className="text-sm text-amber-300">Changement obligatoire</span>}
          {msg && <span className="text-sm text-primary">{msg}</span>}
        </div>
      </form>
    </Card>
  );
}

type Token = { id: string; label: string; prefix: string; lastUsedAt: string | null; createdAt: string };

function TokensCard() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/me/tokens");
    const data = await res.json();
    setTokens(data.tokens || []);
    setLoading(false);
  }

  async function create() {
    setMsg(null);
    const res = await fetch("/api/me/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label || "Dashy" }),
    });
    if (res.ok) {
      const data = await res.json();
      setCreated(data.raw);
      setLabel("");
      await load();
    } else {
      setMsg("Erreur lors de la création");
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/me/tokens/${id}`, { method: "DELETE" });
    await load();
  }

  // Load on mount
  if (loading && tokens.length === 0) {
    load();
  }

  return (
    <Card
      title="Tokens d’API"
      description="Pour connecter un dashboard externe (ex. Dashy) au résumé de vos tâches. Le token brut n’est affiché qu’une seule fois."
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            placeholder="Nom du token (ex. Dashy)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button onClick={create} className="btn-primary shrink-0">
            <Icon name="add" size={16} />
            Générer un token
          </button>
        </div>

        {created && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"
          >
            <p className="text-sm font-medium text-emerald-300">Copiez ce token maintenant, il ne sera plus affiché :</p>
            <code className="mt-1 block break-all rounded bg-background/60 px-2 py-1 text-sm text-on-surface">{created}</code>
            <div className="mt-2 flex gap-2">
              <button
                className="btn-ghost text-xs"
                onClick={() => navigator.clipboard?.writeText(created)}
              >
                Copier
              </button>
              <button className="btn-ghost text-xs" onClick={() => setCreated(null)}>Fermer</button>
            </div>
          </motion.div>
        )}

        {msg && <p className="text-sm text-error">{msg}</p>}

        <ul className="divide-y divide-primary/5 rounded-xl border border-primary/10">
          {tokens.length === 0 && !loading && (
            <li className="px-3 py-4 text-sm text-on-surface-variant">Aucun token actif.</li>
          )}
          <AnimatePresence>
            {tokens.map((t) => (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-on-surface">{t.label}</p>
                  <p className="text-xs text-on-surface-variant">
                    <code>kbt_{t.prefix}…</code> · utilisé {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString() : "jamais"}
                  </p>
                </div>
                <button onClick={() => revoke(t.id)} className="btn-danger text-xs">Révoquer</button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </div>
    </Card>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
