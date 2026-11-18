"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Search, Trash2, X } from "lucide-react";
import { Modal } from "@/components/Modal";
import { Avatar } from "@/components/Avatar";
import { LabelChip } from "@/components/board/LabelChip";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { LABEL_COLORS } from "@/lib/constants";
import { api, apiDelete, apiPatch, apiPost } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import type { MemberRow } from "@/types/api";
import type { Label } from "@prisma/client";

type FoundUser = { id: string; displayName: string; email: string; avatarUrl: string | null };

/** Members of a team board: list, invite (owner), remove (owner). */
export function MembersDialog({
  open,
  onClose,
  boardId,
  ownerId,
  members,
  isOwner,
  currentUserId,
  onAdded,
  onRemoved,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  ownerId: string;
  members: MemberRow[];
  isOwner: boolean;
  currentUserId: string;
  onAdded: (m: MemberRow) => void;
  onRemoved: (userId: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FoundUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const id = setTimeout(async () => {
      try {
        const { users } = await api<{ users: FoundUser[] }>(`/api/users/search?q=${encodeURIComponent(query)}`);
        setResults(users);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  const memberIds = new Set(members.map((m) => m.userId));

  async function invite(user: FoundUser) {
    setPending(user.id);
    try {
      const { member } = await apiPost<{ member: MemberRow }>(`/api/boards/${boardId}/members`, { userId: user.id });
      onAdded(member);
    } catch (e) {
      toast.error(e);
    } finally {
      setPending(null);
    }
  }

  async function remove(m: MemberRow) {
    const ok = await confirm({
      title: t("board.removeMemberConfirm", { name: m.user.displayName }),
      danger: true,
      confirm: t("board.removeMember"),
    });
    if (!ok) return;
    setPending(m.userId);
    try {
      await apiDelete(`/api/boards/${boardId}/members?userId=${encodeURIComponent(m.userId)}`);
      onRemoved(m.userId);
    } catch (e) {
      toast.error(e);
    } finally {
      setPending(null);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("board.members")} size="md">
      {isOwner && (
        <div className="mb-5">
          <label className="label" htmlFor="member-search">
            {t("board.inviteMember")}
          </label>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              id="member-search"
              data-autofocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("board.invitePlaceholder")}
              className="input pl-9"
              autoComplete="off"
            />
          </div>
          {q.trim().length >= 2 && (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line">
              {results.length === 0 ? (
                <li className="px-3 py-3 text-sm text-muted">{searching ? t("card.loading") : t("board.noUsersFound")}</li>
              ) : (
                results.map((u) => {
                  const already = memberIds.has(u.id) || u.id === ownerId;
                  return (
                    <li key={u.id} className="flex items-center gap-3 border-b border-line px-3 py-2 last:border-0">
                      <Avatar name={u.displayName} url={u.avatarUrl} size={28} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-fg">{u.displayName}</span>
                        <span className="block truncate text-xs text-muted">{u.email}</span>
                      </span>
                      {already ? (
                        <span className="inline-flex items-center gap-1 text-xs text-accent-fg">
                          <Check size={13} /> {t("board.added")}
                        </span>
                      ) : (
                        <button type="button" disabled={pending === u.id} onClick={() => invite(u)} className="btn-primary btn-sm">
                          {t("board.invite")}
                        </button>
                      )}
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
      )}

      <p className="section-title mb-2">{t("board.membersCount", { count: members.length })}</p>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={m.user.displayName} url={m.user.avatarUrl} size={30} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-fg">
                {m.user.displayName}
                {m.userId === currentUserId && <span className="font-normal text-muted"> ({t("card.me")})</span>}
              </span>
              <span className="block truncate text-xs text-muted">{m.user.email}</span>
            </span>
            <span className={cn("badge", m.userId === ownerId ? "bg-accent-soft text-accent-fg" : "bg-sunken text-muted")}>
              {m.userId === ownerId ? t("boards.owner") : t("boards.member")}
            </span>
            {isOwner && m.userId !== ownerId && (
              <button
                type="button"
                disabled={pending === m.userId}
                onClick={() => remove(m)}
                className="icon-btn hover:text-danger"
                aria-label={t("board.removeMemberConfirm", { name: m.user.displayName })}
              >
                <X size={16} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

/** Board labels: create, rename, recolor, delete (owner). */
export function LabelsDialog({
  open,
  onClose,
  boardId,
  labels,
  canEdit,
  isOwner,
  onChange,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  boardId: string;
  labels: Label[];
  canEdit: boolean;
  isOwner: boolean;
  onChange: (label: Label) => void;
  onDeleted: (id: string) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<{ id: string | null; name: string; color: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) setEditing(null);
  }, [open]);

  async function save() {
    if (!editing || !editing.name.trim()) return;
    setBusy(true);
    try {
      const body = { name: editing.name.trim(), color: editing.color };
      const { label } = editing.id
        ? await apiPatch<{ label: Label }>(`/api/labels/${editing.id}`, body)
        : await apiPost<{ label: Label }>("/api/labels", { ...body, boardId });
      onChange(label);
      setEditing(null);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function remove(l: Label) {
    const ok = await confirm({ title: t("board.deleteLabelConfirm", { name: l.name }), danger: true, confirm: t("card.delete") });
    if (!ok) return;
    try {
      await apiDelete(`/api/labels/${l.id}`);
      onDeleted(l.id);
    } catch (e) {
      toast.error(e);
    }
  }

  const editor = editing && (
    <form
      className="space-y-3 rounded-lg border border-line p-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <input
        autoFocus
        value={editing.name}
        maxLength={40}
        onChange={(e) => setEditing({ ...editing, name: e.target.value })}
        placeholder={t("card.labelNamePlaceholder")}
        aria-label={t("card.labelNamePlaceholder")}
        className="input"
      />
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("board.columnColor")}>
        {LABEL_COLORS.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={editing.color === c.value}
            aria-label={t(`color.${c.key}`)}
            title={t(`color.${c.key}`)}
            onClick={() => setEditing({ ...editing, color: c.value })}
            className={cn("h-6 w-6 rounded-full", editing.color === c.value && "ring-2 ring-accent ring-offset-2 ring-offset-surface")}
            style={{ backgroundColor: c.value }}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <LabelChip name={editing.name || t("card.labelNamePlaceholder")} color={editing.color} size="md" />
        <span className="flex-1" />
        <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(null)}>
          {t("common.cancel")}
        </button>
        <button type="submit" disabled={busy || !editing.name.trim()} className="btn-primary btn-sm">
          {t("common.save")}
        </button>
      </div>
    </form>
  );

  return (
    <Modal open={open} onClose={onClose} title={t("card.labels")} size="sm">
      <ul className="space-y-1">
        {labels.length === 0 && <li className="py-2 text-sm text-muted">{t("card.noLabels")}</li>}
        {labels.map((l) =>
          editing?.id === l.id ? (
            <li key={l.id}>{editor}</li>
          ) : (
            <li key={l.id} className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-hover">
              <LabelChip name={l.name} color={l.color} size="md" />
              <span className="flex-1" />
              {canEdit && (
                <button
                  type="button"
                  className="icon-btn h-7 w-7"
                  onClick={() => setEditing({ id: l.id, name: l.name, color: l.color })}
                  aria-label={t("board.editLabel", { name: l.name })}
                >
                  <Pencil size={14} />
                </button>
              )}
              {isOwner && (
                <button type="button" className="icon-btn h-7 w-7 hover:text-danger" onClick={() => remove(l)} aria-label={t("board.deleteLabelConfirm", { name: l.name })}>
                  <Trash2 size={14} />
                </button>
              )}
            </li>
          ),
        )}
      </ul>
      {canEdit && (
        <div className="mt-4">
          {editing && !editing.id ? (
            editor
          ) : (
            <button type="button" className="btn-secondary w-full" onClick={() => setEditing({ id: null, name: "", color: LABEL_COLORS[2].value })}>
              {t("card.newLabel")}
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Small "name" prompt used to add a column or rename the board. */
export function NameDialog({
  open,
  onClose,
  title,
  label,
  initial = "",
  submit,
  maxLength,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  label: string;
  initial?: string;
  submit: string;
  maxLength: number;
  onSubmit: (value: string) => Promise<void> | void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setValue(initial);
  }, [open, initial]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="sm">
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim() || busy) return;
          setBusy(true);
          try {
            await onSubmit(value.trim());
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="label" htmlFor="name-dialog-input">
          {label}
        </label>
        <input id="name-dialog-input" data-autofocus value={value} maxLength={maxLength} onChange={(e) => setValue(e.target.value)} className="input" />
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={!value.trim() || busy} className="btn-primary">
            {submit}
          </button>
        </div>
      </form>
    </Modal>
  );
}
