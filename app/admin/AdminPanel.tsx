"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Check,
  Copy,
  KanbanSquare,
  KeyRound,
  ListChecks,
  MoreHorizontal,
  Power,
  Search,
  Shield,
  ShieldOff,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { Menu, MenuItem, MenuSeparator } from "@/components/Menu";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { apiDelete, apiPatch, apiPost } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { translateApiError } from "@/lib/i18n";
import { TimeAgo } from "@/components/TimeAgo";

type Stats = { users: number; boards: number; activeTasks: number; completedTasks: number };
type AdminUser = {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  globalRole: "USER" | "ADMIN";
  active: boolean;
  createdAt: Date | string;
  _count: { ownedBoards: number };
};
export type KosmyAdminSettings = {
  issuer: string;
  clientId: string;
  autoCreate: boolean;
  hasSecret: boolean;
  base: string;
  redirectUri: string;
  loginUri: string;
};
type AdminBoard = {
  id: string;
  name: string;
  type: "PERSONAL" | "TEAM";
  updatedAt: Date | string;
  owner: { id: string; displayName: string; email: string };
  _count: { cards: number; members: number };
};

type Tab = "users" | "boards" | "kosmy";

export function AdminPanel({
  users,
  boards,
  stats,
  currentUserId,
  kosmy,
}: {
  users: AdminUser[];
  boards: AdminBoard[];
  stats: Stats;
  currentUserId: string;
  kosmy: KosmyAdminSettings;
}) {
  const { t } = useI18n();
  const [userList, setUserList] = useState(users);
  const [boardList, setBoardList] = useState(boards);
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<Tab>("users");

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: "users", label: t("admin.users"), count: userList.length },
    { key: "boards", label: t("admin.allBoards"), count: boardList.length },
    { key: "kosmy", label: "Kosmy Board" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-fg">{t("admin.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("admin.subtitle")}</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} className="btn-primary">
          <UserPlus size={16} /> {t("admin.createUser")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t("admin.users")} value={userList.length || stats.users} icon={<Users size={16} />} />
        <StatCard label={t("admin.boards")} value={boardList.length || stats.boards} icon={<KanbanSquare size={16} />} />
        <StatCard label={t("admin.activeTasks")} value={stats.activeTasks} icon={<ListChecks size={16} />} />
        <StatCard label={t("admin.completedTasks")} value={stats.completedTasks} icon={<CheckCircle2 size={16} />} />
      </div>

      <div role="tablist" aria-label={t("admin.title")} className="flex gap-1 border-b border-line">
        {tabs.map((x) => (
          <button
            key={x.key}
            role="tab"
            type="button"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              tab === x.key ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg",
            )}
          >
            {x.label}
            {x.count !== undefined && <span className="rounded-full bg-sunken px-1.5 text-xs text-muted">{x.count}</span>}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <UsersTable
          users={userList}
          currentUserId={currentUserId}
          onChange={(u) => setUserList((list) => list.map((x) => (x.id === u.id ? { ...x, ...u } : x)))}
          onRemoved={(id) => {
            setUserList((list) => list.filter((x) => x.id !== id));
            setBoardList((list) => list.filter((b) => b.owner.id !== id));
          }}
        />
      )}
      {tab === "boards" && <BoardsTable boards={boardList} />}
      {tab === "kosmy" && <KosmyBoardSettingsCard initial={kosmy} />}

      <CreateUserModal open={showCreate} onClose={() => setShowCreate(false)} onCreated={(u) => setUserList((list) => [u, ...list])} />
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="panel p-4">
      <p className="flex items-center gap-2 text-xs font-medium text-muted">
        {icon}
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-fg">{value}</p>
    </div>
  );
}

function UsersTable({
  users,
  currentUserId,
  onChange,
  onRemoved,
}: {
  users: AdminUser[];
  currentUserId: string;
  onChange: (u: Partial<AdminUser> & { id: string }) => void;
  onRemoved: (id: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [resetFor, setResetFor] = useState<AdminUser | null>(null);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? users.filter((u) => u.displayName.toLowerCase().includes(s) || u.email.toLowerCase().includes(s)) : users;
  }, [users, q]);

  async function update(u: AdminUser, body: { active?: boolean; globalRole?: "USER" | "ADMIN" }) {
    try {
      await apiPatch("/api/admin/users", { userId: u.id, ...body });
      onChange({ id: u.id, ...body });
    } catch (e) {
      toast.error(e);
    }
  }

  async function remove(u: AdminUser) {
    const ok = await confirm({
      title: t("admin.deleteUserConfirm", { name: u.displayName }),
      message: u._count.ownedBoards ? t("admin.deleteUserBoards", { count: u._count.ownedBoards }) : undefined,
      danger: true,
      confirm: t("admin.delete"),
    });
    if (!ok) return;
    try {
      await apiDelete(`/api/admin/users/${u.id}`);
      onRemoved(u.id);
    } catch (e) {
      toast.error(e);
    }
  }

  return (
    <div className="space-y-3">
      <label className="relative block max-w-xs">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} className="input pl-9" placeholder={t("admin.searchUsers")} aria-label={t("admin.searchUsers")} />
      </label>
      <div className="panel overflow-hidden">
        <ul className="divide-y divide-line">
          {shown.map((u) => {
            const self = u.id === currentUserId;
            return (
              <li key={u.id} className={cn("flex items-center gap-3 px-4 py-3", !u.active && "opacity-60")}>
                <Avatar name={u.displayName} url={u.avatarUrl} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-fg">
                    {u.displayName} {self && <span className="font-normal text-muted">{t("admin.you")}</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{u.email}</p>
                </div>
                <div className="hidden text-right text-xs text-muted md:block">
                  <p>{t("admin.boardsCount", { count: u._count.ownedBoards })}</p>
                  <p className="text-faint">
                    <TimeAgo date={u.createdAt} prefix={(when) => t("admin.joined", { when })} />
                  </p>
                </div>
                <span className={cn("badge hidden sm:inline-flex", u.globalRole === "ADMIN" ? "bg-accent-soft text-accent-fg" : "bg-sunken text-muted")}>
                  {u.globalRole === "ADMIN" ? t("admin.adminRole") : t("admin.userRole")}
                </span>
                <span className={cn("badge", u.active ? "bg-sunken text-muted" : "bg-danger-soft text-danger")}>
                  {u.active ? t("admin.active") : t("admin.inactive")}
                </span>
                <Menu
                  label={t("admin.userActions", { name: u.displayName })}
                  trigger={(p) => (
                    <button type="button" {...p} className="icon-btn" aria-label={t("admin.userActions", { name: u.displayName })}>
                      <MoreHorizontal size={16} />
                    </button>
                  )}
                >
                  {(close) => (
                    <>
                      <MenuItem
                        icon={u.globalRole === "ADMIN" ? <ShieldOff size={15} /> : <Shield size={15} />}
                        disabled={self}
                        onClick={() => {
                          close();
                          update(u, { globalRole: u.globalRole === "ADMIN" ? "USER" : "ADMIN" });
                        }}
                      >
                        {u.globalRole === "ADMIN" ? t("admin.removeAdmin") : t("admin.makeAdmin")}
                      </MenuItem>
                      <MenuItem icon={<KeyRound size={15} />} onClick={() => { close(); setResetFor(u); }}>
                        {t("admin.resetPassword")}
                      </MenuItem>
                      <MenuItem
                        icon={<Power size={15} />}
                        disabled={self}
                        onClick={() => {
                          close();
                          update(u, { active: !u.active });
                        }}
                      >
                        {u.active ? t("admin.deactivate") : t("admin.activate")}
                      </MenuItem>
                      <MenuSeparator />
                      <MenuItem danger icon={<Trash2 size={15} />} disabled={self} onClick={() => { close(); remove(u); }}>
                        {t("admin.delete")}
                      </MenuItem>
                    </>
                  )}
                </Menu>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">{t("board.noUsersFound")}</li>}
        </ul>
      </div>
      <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} />
    </div>
  );
}

function BoardsTable({ boards }: { boards: AdminBoard[] }) {
  const { t } = useI18n();
  if (boards.length === 0) return <p className="panel p-6 text-center text-sm text-muted">{t("admin.noBoards")}</p>;
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="border-b border-line text-xs text-muted">
          <tr>
            <th className="px-4 py-2.5 font-medium">{t("boards.newModal.name")}</th>
            <th className="px-4 py-2.5 font-medium">{t("boards.owner")}</th>
            <th className="px-4 py-2.5 font-medium">{t("boards.newModal.type")}</th>
            <th className="px-4 py-2.5 text-right font-medium">{t("admin.cards")}</th>
            <th className="px-4 py-2.5 text-right font-medium">{t("board.members")}</th>
            <th className="px-4 py-2.5 font-medium">{t("admin.updated")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {boards.map((b) => (
            <tr key={b.id} className="hover:bg-hover">
              <td className="px-4 py-2.5">
                <Link href={`/boards/${b.id}`} className="font-medium text-fg hover:underline" title={t("admin.viewReadOnly")}>
                  {b.name}
                </Link>
              </td>
              <td className="px-4 py-2.5 text-muted">{b.owner.displayName}</td>
              <td className="px-4 py-2.5">
                <span className={cn("badge", b.type === "TEAM" ? "bg-accent-soft text-accent-fg" : "bg-sunken text-muted")}>
                  {b.type === "TEAM" ? t("boards.team") : t("boards.personal")}
                </span>
              </td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted">{b._count.cards}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-muted">{b._count.members}</td>
              <td className="px-4 py-2.5 text-muted">
                <TimeAgo date={b.updatedAt} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResetPasswordModal({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      await apiPatch("/api/admin/users", { userId: user.id, password });
      toast.success(t("admin.passwordReset", { name: user.displayName }));
      setPassword("");
      onClose();
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={!!user} onClose={onClose} title={t("admin.resetPasswordFor", { name: user?.displayName ?? "" })} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="reset-password">
            {t("admin.temporaryPassword")}
          </label>
          <input id="reset-password" data-autofocus type="text" minLength={8} required className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          <p className="hint">{t("admin.createModal.mustChange")}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" className="btn-primary" disabled={busy || password.length < 8}>
            {t("admin.resetPassword")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateUserModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: AdminUser) => void }) {
  const { t } = useI18n();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { user } = await apiPost<{ user: AdminUser }>("/api/admin/users", {
        email,
        displayName,
        password,
        globalRole: isAdmin ? "ADMIN" : "USER",
      });
      onCreated(user);
      setDisplayName("");
      setEmail("");
      setPassword("");
      setIsAdmin(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? translateApiError(err.message, t) : t("admin.createError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("admin.createModal.title")} size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="cu-name">
            {t("admin.createModal.displayName")}
          </label>
          <input id="cu-name" data-autofocus required maxLength={80} className="input" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={t("admin.createModal.displayNamePlaceholder")} />
        </div>
        <div>
          <label className="label" htmlFor="cu-email">
            {t("admin.createModal.email")}
          </label>
          <input id="cu-email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("admin.createModal.emailPlaceholder")} />
        </div>
        <div>
          <label className="label" htmlFor="cu-password">
            {t("admin.createModal.password")}
          </label>
          <input id="cu-password" type="text" required minLength={8} className="input font-mono" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          <p className="hint">{t("admin.createModal.mustChange")}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--accent))]" />
          {t("admin.createModal.isAdmin")}
        </label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("admin.createModal.cancel")}
          </button>
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? t("admin.createModal.submitting") : t("admin.createModal.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KosmyBoardSettingsCard({ initial }: { initial: KosmyAdminSettings }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [issuer, setIssuer] = useState(initial.issuer);
  const [clientId, setClientId] = useState(initial.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [autoCreate, setAutoCreate] = useState(initial.autoCreate);
  const [hasSecret, setHasSecret] = useState(initial.hasSecret);
  const [isOn, setIsOn] = useState(initial.hasSecret && !!initial.issuer);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/kosmy-board", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issuer, clientId, clientSecret, autoCreate }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = "admin.kosmy.error." + data.error;
        const text = t(key);
        setMsg({ ok: false, text: text === key ? data.error || t("misc.error") : text });
        return;
      }
      // Never shown again: clear the field, keep only "a secret is saved".
      setClientSecret("");
      setHasSecret(true);
      setIssuer(data.settings.issuer);
      setIsOn(true);
      setMsg(data.reachable ? { ok: true, text: t("admin.kosmy.saved") } : { ok: false, text: t("admin.kosmy.savedUnreachable") });
    } catch {
      setMsg({ ok: false, text: t("api.networkError") });
    } finally {
      setSaving(false);
    }
  }

  async function disable() {
    if (!(await confirm({ title: t("admin.kosmy.disableConfirm"), danger: true, confirm: t("admin.kosmy.disable") }))) return;
    const res = await fetch("/api/admin/kosmy-board", { method: "DELETE" }).catch(() => null);
    if (res?.ok) {
      setIsOn(false);
      setHasSecret(false);
      setClientSecret("");
      setMsg({ ok: true, text: t("admin.kosmy.disabled") });
    }
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h3 className="text-[15px] font-semibold text-fg">{t("admin.kosmy.title")}</h3>
        <span className={cn("badge", isOn ? "bg-accent-soft text-accent-fg" : "bg-sunken text-muted")}>{isOn ? t("admin.kosmy.on") : t("admin.kosmy.off")}</span>
      </div>

      <div className="grid gap-8 p-5 lg:grid-cols-2">
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-muted">{t("admin.kosmy.desc")}</p>
          <div>
            <label className="label" htmlFor="kosmy-issuer">
              {t("admin.kosmy.issuer")}
            </label>
            <input id="kosmy-issuer" className="input font-mono" value={issuer} onChange={(e) => setIssuer(e.target.value)} placeholder="https://board.example.com/oidc" required />
          </div>
          <div>
            <label className="label" htmlFor="kosmy-client-id">
              {t("admin.kosmy.clientId")}
            </label>
            <input id="kosmy-client-id" className="input font-mono" value={clientId} onChange={(e) => setClientId(e.target.value)} required autoComplete="off" />
          </div>
          <div>
            <label className="label" htmlFor="kosmy-client-secret">
              {t("admin.kosmy.clientSecret")}
            </label>
            <input
              id="kosmy-client-secret"
              type="password"
              className="input font-mono"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={hasSecret ? t("admin.kosmy.secretKeep") : t("admin.kosmy.secretPlaceholder")}
              required={!hasSecret}
              autoComplete="new-password"
            />
          </div>
          <label className="flex items-start gap-2 text-sm text-fg">
            <input type="checkbox" checked={autoCreate} onChange={(e) => setAutoCreate(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[rgb(var(--accent))]" />
            <span>
              {t("admin.kosmy.autoCreate")}
              <span className="mt-0.5 block text-xs text-muted">{t("admin.kosmy.autoCreateHint")}</span>
            </span>
          </label>

          {msg && <p className={cn("text-sm", msg.ok ? "text-accent-fg" : "text-danger")}>{msg.text}</p>}

          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? t("admin.kosmy.saving") : t("admin.kosmy.save")}
            </button>
            {isOn && (
              <button type="button" onClick={disable} className="btn-ghost">
                {t("admin.kosmy.disable")}
              </button>
            )}
          </div>
        </form>

        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-fg">{t("admin.kosmy.urls")}</h4>
          <CopyField label={t("admin.kosmy.redirectUri")} value={initial.redirectUri} />
          <CopyField label={t("admin.kosmy.loginUri")} value={initial.loginUri} />
          <p className="text-xs text-muted">{t("admin.kosmy.urlsHint", { base: initial.base })}</p>
        </div>
      </div>
    </section>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 break-all rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-xs text-fg">{value}</code>
        <button
          type="button"
          className="icon-btn"
          aria-label={t("profile.copy")}
          onClick={() => {
            navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </button>
      </div>
    </div>
  );
}
