"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { useI18n, useChangeLocale } from "@/lib/i18n/client";
import { LOCALES, type Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { KosmyBoardSubmit, kosmyErrorMessage } from "@/components/KosmyBoard";

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
  kosmy: KosmyState;
};

type KosmyState = { enabled: boolean; linked: boolean; justLinked: boolean; error: string | null };

export function ProfileForm({ user, mustChangeBanner, kosmy }: Props) {
  const { t } = useI18n();
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-on-surface">{t("profile.title")}</h1>
        <p className="text-sm text-on-surface-variant">{t("profile.subtitle")}</p>
      </div>

      <AnimatePresence>
        {mustChangeBanner && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300"
          >
            {t("profile.mustChangePassword")}
          </motion.div>
        )}
      </AnimatePresence>

      <IdentityCard user={user} />
      <PasswordCard mustChange={user.mustChangePwd} />
      {(kosmy.enabled || kosmy.linked) && <KosmyBoardCard state={kosmy} />}
      <LanguageCard />
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
  const { t } = useI18n();
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
    setMsg(res.ok ? t("profile.saved") : t("profile.saveError"));
  }

  return (
    <Card title={t("profile.identity")} description={t("profile.identityDesc")}>
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
            <span className="text-sm font-medium text-on-surface-variant">{t("profile.displayName")}</span>
            <input
              className="input mt-1"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-on-surface-variant">{t("profile.avatarUrl")}</span>
            <input
              className="input mt-1"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </label>
          <div className="flex items-center gap-4">
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? t("profile.saving") : t("profile.save")}
            </button>
            <span className="text-sm text-on-surface-variant">
              {user.email} · {user.globalRole === "ADMIN" ? t("profile.admin") : t("profile.user")}
            </span>
            {msg && <span className="text-sm text-primary">{msg}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}

function PasswordCard({ mustChange }: { mustChange: boolean }) {
  const { t } = useI18n();
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
      setMsg(t("profile.passwordUpdated"));
      setCurrent("");
      setNext("");
    } else {
      const data = await res.json().catch(() => ({}));
      setMsg(data.error || t("misc.error"));
    }
  }

  return (
    <Card title={t("profile.password")} description={t("profile.passwordDesc")}>
      <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
        <input
          type="password"
          autoComplete="current-password"
          placeholder={t("profile.currentPasswordPlaceholder")}
          className="input"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          required
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder={t("profile.newPasswordPlaceholder")}
          className="input"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          required
        />
        <div className="flex items-center gap-4 md:col-span-2">
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "…" : t("profile.changePassword")}
          </button>
          {mustChange && <span className="text-sm text-amber-300">{t("profile.forcedChange")}</span>}
          {msg && <span className="text-sm text-primary">{msg}</span>}
        </div>
      </form>
    </Card>
  );
}

function LanguageCard() {
  const { t, locale } = useI18n();
  const { change, changing } = useChangeLocale();

  const labels: Record<Locale, string> = {
    fr: "Français",
    en: "English",
  };

  return (
    <Card title={t("profile.language")} description={t("profile.languageDesc")}>
      <div className="flex flex-wrap gap-3">
        {LOCALES.map((l) => (
          <button
            key={l}
            onClick={() => change(l)}
            disabled={changing || l === locale}
            className={cn(
              "rounded-xl border px-5 py-3 text-sm font-medium transition-all",
              l === locale
                ? "border-primary/40 bg-primary/10 text-primary shadow-glow-sm"
                : "border-primary/15 bg-surface-container/50 text-on-surface-variant hover:border-primary/30 hover:bg-primary/5",
            )}
          >
            {labels[l]}
            {l === locale && <span className="ml-2 text-xs">✓</span>}
          </button>
        ))}
      </div>
    </Card>
  );
}

function KosmyBoardCard({ state }: { state: KosmyState }) {
  const { t } = useI18n();
  const [linked, setLinked] = useState(state.linked);
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(
    state.error
      ? { ok: false, text: kosmyErrorMessage(t, state.error) }
      : state.justLinked
        ? { ok: true, text: t("profile.kosmy.linkedNow") }
        : null,
  );

  async function unlink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch("/api/me/kosmy-board", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setBusy(false);
    if (res.ok) {
      setLinked(false);
      setConfirming(false);
      setPassword("");
      setMsg({ ok: true, text: t("profile.kosmy.unlinked") });
    } else {
      setMsg({ ok: false, text: t("profile.kosmy.wrongPassword") });
    }
  }

  return (
    <Card title={t("profile.kosmy.title")} description={t("profile.kosmy.desc")}>
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-on-surface">
          <Icon name={linked ? "verified_user" : "share"} size={16} className={linked ? "text-primary" : "text-on-surface-variant"} />
          {linked ? t("profile.kosmy.linked") : t("profile.kosmy.notLinked")}
        </p>

        {!linked && state.enabled && (
          // A real form post: the route starts the Kosmy Board flow and redirects to the Board.
          <form method="post" action="/auth/kosmy-board/link" className="max-w-xs">
            <KosmyBoardSubmit label={t("profile.kosmy.link")} />
          </form>
        )}

        {linked && !confirming && (
          <button onClick={() => setConfirming(true)} className="btn-danger">
            {t("profile.kosmy.unlink")}
          </button>
        )}

        {linked && confirming && (
          <form onSubmit={unlink} className="space-y-3">
            <p className="text-sm text-on-surface-variant">{t("profile.kosmy.unlinkHint")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                autoComplete="current-password"
                required
                className="input sm:max-w-xs"
                placeholder={t("profile.kosmy.unlinkPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" disabled={busy} className="btn-danger shrink-0">
                {busy ? "…" : t("profile.kosmy.unlinkConfirm")}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="btn-ghost shrink-0">
                {t("profile.kosmy.cancel")}
              </button>
            </div>
          </form>
        )}

        {msg && <p className={cn("text-sm", msg.ok ? "text-primary" : "text-error")}>{msg.text}</p>}
      </div>
    </Card>
  );
}

type Token = { id: string; label: string; prefix: string; lastUsedAt: string | null; createdAt: string };

function TokensCard() {
  const { t } = useI18n();
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
      body: JSON.stringify({ label: label || t("misc.dashy") }),
    });
    if (res.ok) {
      const data = await res.json();
      setCreated(data.raw);
      setLabel("");
      await load();
    } else {
      setMsg(t("profile.tokenCreatedError"));
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/me/tokens/${id}`, { method: "DELETE" });
    await load();
  }

  if (loading && tokens.length === 0) {
    load();
  }

  return (
    <Card
      title={t("profile.tokens")}
      description={t("profile.tokensDesc")}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            placeholder={t("profile.tokenLabelPlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button onClick={create} className="btn-primary shrink-0">
            <Icon name="add" size={16} />
            {t("profile.generateToken")}
          </button>
        </div>

        {created && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3"
          >
            <p className="text-sm font-medium text-emerald-300">{t("profile.copyTokenNow")}</p>
            <code className="mt-1 block break-all rounded bg-background/60 px-2 py-1 text-sm text-on-surface">{created}</code>
            <div className="mt-2 flex gap-2">
              <button
                className="btn-ghost text-xs"
                onClick={() => navigator.clipboard?.writeText(created)}
              >
                {t("profile.copy")}
              </button>
              <button className="btn-ghost text-xs" onClick={() => setCreated(null)}>{t("profile.close")}</button>
            </div>
          </motion.div>
        )}

        {msg && <p className="text-sm text-error">{msg}</p>}

        <ul className="divide-y divide-primary/5 rounded-xl border border-primary/10">
          {tokens.length === 0 && !loading && (
            <li className="px-3 py-4 text-sm text-on-surface-variant">{t("profile.noTokens")}</li>
          )}
          <AnimatePresence>
            {tokens.map((tk) => (
              <motion.li
                key={tk.id}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center justify-between gap-3 px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-on-surface">{tk.label}</p>
                  <p className="text-xs text-on-surface-variant">
                    <code>kbt_{tk.prefix}…</code> · {t("profile.used")} {tk.lastUsedAt ? new Date(tk.lastUsedAt).toLocaleDateString() : t("profile.never")}
                  </p>
                </div>
                <button onClick={() => revoke(tk.id)} className="btn-danger text-xs">{t("profile.revoke")}</button>
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