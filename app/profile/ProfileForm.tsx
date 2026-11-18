"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Copy, KeyRound, Link2, Plus, ShieldCheck } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { KosmyBoardSubmit, kosmyErrorMessage } from "@/components/KosmyBoard";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { api, apiDelete, apiPatch, apiPost } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { translateApiError } from "@/lib/i18n";
import { timeAgo } from "@/lib/format";

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
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-fg">{t("profile.title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("profile.subtitle")}</p>
      </div>

      {mustChangeBanner && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-warn">
          <AlertTriangle size={18} className="mt-px shrink-0" />
          <span>{t("profile.mustChangePassword")}</span>
        </div>
      )}

      {mustChangeBanner ? (
        <PasswordCard mustChange />
      ) : (
        <>
          <IdentityCard user={user} />
          <AppearanceCard />
          <PasswordCard mustChange={false} />
          {(kosmy.enabled || kosmy.linked) && <KosmyBoardCard state={kosmy} />}
          <TokensCard />
        </>
      )}
    </div>
  );
}

function Card({ title, description, children, icon }: { title: string; description?: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <section className="panel p-5 md:p-6">
      <div className="mb-5 flex items-start gap-3">
        {icon && <span className="mt-0.5 text-muted">{icon}</span>}
        <div>
          <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p role={msg.ok ? "status" : "alert"} className={cn("text-sm", msg.ok ? "text-accent-fg" : "text-danger")}>
      {msg.ok && <Check size={14} className="mr-1 inline" />}
      {msg.text}
    </p>
  );
}

function IdentityCard({ user }: { user: Props["user"] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      await apiPatch("/api/me/profile", { displayName, avatarUrl: avatarUrl.trim() || null });
      setMsg({ ok: true, text: t("profile.saved") });
      router.refresh(); // header & sidebar show the new name/avatar
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? translateApiError(err.message, t) : t("profile.saveError") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={t("profile.identity")} description={t("profile.identityDesc")}>
      <form onSubmit={save} className="flex flex-col gap-5 sm:flex-row">
        <Avatar name={displayName || user.displayName} url={avatarUrl.trim() || null} size={72} className="text-2xl" />
        <div className="flex-1 space-y-4">
          <div>
            <label className="label" htmlFor="displayName">
              {t("profile.displayName")}
            </label>
            <input id="displayName" className="input" maxLength={80} required value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="email">
              {t("auth.login.email")}
            </label>
            <input id="email" className="input bg-sunken text-muted" value={user.email} readOnly />
          </div>
          <div>
            <label className="label" htmlFor="avatarUrl">
              {t("profile.avatarUrl")}
            </label>
            <input
              id="avatarUrl"
              className="input"
              type="url"
              inputMode="url"
              placeholder="https://…"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving || !displayName.trim()} className="btn-primary">
              {saving ? t("profile.saving") : t("profile.save")}
            </button>
            <span className="badge bg-sunken text-muted">
              {user.globalRole === "ADMIN" ? <ShieldCheck size={12} /> : null}
              {user.globalRole === "ADMIN" ? t("profile.admin") : t("profile.user")}
            </span>
            <Status msg={msg} />
          </div>
        </div>
      </form>
    </Card>
  );
}

function AppearanceCard() {
  const { t } = useI18n();
  return (
    <Card title={t("profile.appearance")} description={t("profile.appearanceDesc")}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="label">{t("profile.language")}</p>
          <LanguageSwitch />
        </div>
        <div>
          <p className="label">{t("profile.theme")}</p>
          <ThemeToggle />
        </div>
      </div>
    </Card>
  );
}

function PasswordCard({ mustChange }: { mustChange: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) {
      setMsg({ ok: false, text: t("profile.passwordMismatch") });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await apiPost("/api/me/password", { currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setMsg({ ok: true, text: t("profile.passwordUpdated") });
      if (mustChange) {
        router.replace("/boards");
        router.refresh();
      }
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? translateApiError(err.message, t) : t("misc.error") });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={t("profile.password")} description={t("profile.passwordDesc")} icon={<KeyRound size={18} />}>
      <form onSubmit={submit} className="grid gap-4 sm:max-w-md">
        <div>
          <label className="label" htmlFor="current-password">
            {t("profile.currentPassword")}
          </label>
          <input id="current-password" type="password" autoComplete="current-password" required className="input" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="new-password">
            {t("profile.newPassword")}
          </label>
          <input id="new-password" type="password" autoComplete="new-password" required minLength={8} className="input" value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="confirm-password">
            {t("profile.confirmPassword")}
          </label>
          <input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving} className="btn-primary">
            {t("profile.changePassword")}
          </button>
          <Status msg={msg} />
        </div>
      </form>
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
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      setLinked(false);
      setConfirming(false);
      setPassword("");
      setMsg({ ok: true, text: t("profile.kosmy.unlinked") });
    } else {
      setMsg({ ok: false, text: t("profile.kosmy.wrongPassword") });
    }
  }

  return (
    <Card title={t("profile.kosmy.title")} description={t("profile.kosmy.desc")} icon={<Link2 size={18} />}>
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-fg">
          <span className={cn("h-2 w-2 rounded-full", linked ? "bg-accent" : "bg-line-strong")} />
          {linked ? t("profile.kosmy.linked") : t("profile.kosmy.notLinked")}
        </p>

        {!linked && state.enabled && (
          // A real form post: the route starts the Kosmy Board flow and redirects to the Board.
          <form method="post" action="/auth/kosmy-board/link" className="max-w-xs">
            <KosmyBoardSubmit label={t("profile.kosmy.link")} />
          </form>
        )}

        {linked && !confirming && (
          <button type="button" onClick={() => setConfirming(true)} className="btn-danger">
            {t("profile.kosmy.unlink")}
          </button>
        )}

        {linked && confirming && (
          <form onSubmit={unlink} className="space-y-3">
            <p className="text-sm text-muted">{t("profile.kosmy.unlinkHint")}</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                autoComplete="current-password"
                required
                className="input sm:max-w-xs"
                placeholder={t("profile.kosmy.unlinkPassword")}
                aria-label={t("profile.kosmy.unlinkPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button type="submit" disabled={busy} className="btn-danger shrink-0">
                {t("profile.kosmy.unlinkConfirm")}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="btn-ghost shrink-0">
                {t("profile.kosmy.cancel")}
              </button>
            </div>
          </form>
        )}

        <Status msg={msg} />
      </div>
    </Card>
  );
}

type Token = { id: string; label: string; prefix: string; lastUsedAt: string | null; createdAt: string };

function TokensCard() {
  const { t, locale } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [tokens, setTokens] = useState<Token[] | null>(null);
  const [label, setLabel] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { tokens } = await api<{ tokens: Token[] }>("/api/me/tokens");
      setTokens(tokens);
    } catch (e) {
      toast.error(e);
      setTokens([]);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { raw } = await apiPost<{ raw: string }>("/api/me/tokens", { label: label.trim() || t("misc.dashy") });
      setCreated(raw);
      setCopied(false);
      setLabel("");
      await load();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(tk: Token) {
    const ok = await confirm({ title: t("profile.revokeConfirm", { name: tk.label }), message: t("profile.revokeHint"), danger: true, confirm: t("profile.revoke") });
    if (!ok) return;
    try {
      await apiDelete(`/api/me/tokens/${tk.id}`);
      setTokens((ts) => ts?.filter((x) => x.id !== tk.id) ?? null);
    } catch (err) {
      toast.error(err);
    }
  }

  async function copy() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created);
      setCopied(true);
    } catch {
      /* clipboard blocked (http) — the token stays selectable */
    }
  }

  return (
    <Card title={t("profile.tokens")} description={t("profile.tokensDesc")}>
      <div className="space-y-4">
        <form onSubmit={create} className="flex flex-col gap-2 sm:flex-row">
          <input
            className="input"
            maxLength={80}
            placeholder={t("profile.tokenLabelPlaceholder")}
            aria-label={t("profile.tokenLabelPlaceholder")}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
          <button type="submit" disabled={busy} className="btn-primary shrink-0">
            <Plus size={16} /> {t("profile.generateToken")}
          </button>
        </form>

        {created && (
          <div className="rounded-xl border border-accent/30 bg-accent-soft p-3">
            <p className="text-sm font-medium text-accent-fg">{t("profile.copyTokenNow")}</p>
            <code className="mt-2 block select-all break-all rounded-lg bg-surface px-2.5 py-2 font-mono text-[13px] text-fg">{created}</code>
            <div className="mt-2 flex gap-2">
              <button type="button" className="btn-secondary btn-sm" onClick={copy}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? t("profile.copied") : t("profile.copy")}
              </button>
              <button type="button" className="btn-ghost btn-sm" onClick={() => setCreated(null)}>
                {t("profile.close")}
              </button>
            </div>
          </div>
        )}

        <ul className="divide-y divide-line rounded-xl border border-line">
          {tokens === null ? (
            <li className="px-3 py-4 text-sm text-muted">{t("card.loading")}</li>
          ) : tokens.length === 0 ? (
            <li className="px-3 py-4 text-sm text-muted">{t("profile.noTokens")}</li>
          ) : (
            tokens.map((tk) => (
              <li key={tk.id} className="flex items-center justify-between gap-3 px-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-fg">{tk.label}</p>
                  <p className="text-xs text-muted">
                    <code className="font-mono">kbt_{tk.prefix}…</code> · {t("profile.used")}{" "}
                    {tk.lastUsedAt ? timeAgo(tk.lastUsedAt, locale) : t("profile.never")}
                  </p>
                </div>
                <button type="button" onClick={() => revoke(tk)} className="btn-danger btn-sm">
                  {t("profile.revoke")}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </Card>
  );
}
