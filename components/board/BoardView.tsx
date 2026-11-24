"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Eye, Loader2, LogOut, MoreHorizontal, Pencil, Search, Tag, Trash2, User, UserPlus, Users, X } from "lucide-react";
import { Kanban } from "@/components/board/Kanban";
import { CardModal } from "@/components/board/CardModal";
import { LabelsDialog, MembersDialog, NameDialog } from "@/components/board/BoardDialogs";
import { ConfettiOnDoneDrop } from "@/components/ConfettiOnDoneDrop";
import { Avatar } from "@/components/Avatar";
import { Menu, MenuItem, MenuSeparator } from "@/components/Menu";
import { useConfirm } from "@/components/Confirm";
import { useToast } from "@/components/Toast";
import { apiDelete, apiPatch, apiPost } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { addDays, dayKey, parseDay } from "@/lib/calendar";
import type { BoardData, CardRow, ColumnRow, CurrentUser, MemberRow } from "@/types/api";
import type { Label } from "@prisma/client";

/** Set when the board is the board of a day / week in another board's calendar. */
export type CalendarInfo = { parentId: string; parentName: string; period: "DAY" | "WEEK"; date: string };

export function BoardView({
  board,
  currentUser,
  isOwner,
  canEdit,
  calendar = null,
  calendarCount = 0,
}: {
  board: BoardData;
  currentUser: CurrentUser;
  isOwner: boolean;
  canEdit: boolean;
  calendar?: CalendarInfo | null;
  /** Number of day / week boards in this board's calendar. */
  calendarCount?: number;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [name, setName] = useState(board.name);
  const [type, setType] = useState(board.type);
  const [columns, setColumns] = useState<ColumnRow[]>(board.columns);
  const [labels, setLabels] = useState<Label[]>(board.labels);
  const [members, setMembers] = useState<MemberRow[]>(board.members);
  const [openCardId, setOpenCardId] = useState<string | null>(searchParams.get("card"));
  const [query, setQuery] = useState("");
  const [mine, setMine] = useState(false);
  const [dialog, setDialog] = useState<null | "members" | "labels" | "rename" | "column">(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const isTeam = type === "TEAM";
  const calendarHref = calendar
    ? `/boards/${calendar.parentId}/calendar?view=${calendar.period === "WEEK" ? "week" : "month"}&date=${calendar.date}`
    : `/boards/${board.id}/calendar`;
  const [stepping, setStepping] = useState<-1 | 1 | null>(null);

  /** Go to the previous / next day (or week), creating its board if needed. */
  async function step(dir: -1 | 1) {
    if (!calendar || stepping) return;
    setStepping(dir);
    try {
      const date = dayKey(addDays(parseDay(calendar.date)!, dir * (calendar.period === "WEEK" ? 7 : 1)));
      const { board: target } = await apiPost<{ board: { id: string } }>(`/api/boards/${calendar.parentId}/calendar`, {
        period: calendar.period,
        date,
      });
      router.push(`/boards/${target.id}`);
      router.refresh();
    } catch (e) {
      toast.error(e);
      setStepping(null);
    }
  }

  // Keep ?card= in the URL so a card can be shared / opened from a notification.
  const openCard = useCallback((id: string | null) => {
    setOpenCardId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("card", id);
    else url.searchParams.delete("card");
    window.history.replaceState(null, "", url.pathname + url.search);
  }, []);

  useEffect(() => {
    const id = searchParams.get("card");
    if (id) setOpenCardId(id);
  }, [searchParams]);

  // "/" focuses the filter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) && !el.isContentEditable) {
        e.preventDefault();
        filterRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q && !mine) return null;
    const ids = new Set<string>();
    for (const col of columns)
      for (const card of col.cards) {
        const matchText =
          !q ||
          card.title.toLowerCase().includes(q) ||
          card.labels.some(({ label }) => label.name.toLowerCase().includes(q)) ||
          (card.assignee?.displayName.toLowerCase().includes(q) ?? false);
        const matchMine = !mine || card.assigneeId === currentUser.id;
        if (matchText && matchMine) ids.add(card.id);
      }
    return ids;
  }, [columns, query, mine, currentUser.id]);

  // ---------- Board-level actions ----------
  async function rename(next: string) {
    try {
      await apiPatch(`/api/boards/${board.id}`, { name: next });
      setName(next);
      setDialog(null);
      router.refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function toggleType() {
    const next = isTeam ? "PERSONAL" : "TEAM";
    if (next === "PERSONAL" && members.length > 1) {
      const ok = await confirm({
        title: t("board.makePersonalConfirm"),
        message: t("board.makePersonalHint"),
        confirm: t("board.makePersonal"),
        danger: true,
      });
      if (!ok) return;
    }
    try {
      await apiPatch(`/api/boards/${board.id}`, { type: next });
      setType(next);
      if (next === "TEAM") {
        setMembers([
          {
            id: "owner",
            boardId: board.id,
            userId: board.owner.id,
            role: "OWNER",
            joinedAt: new Date(),
            user: board.owner,
          },
        ]);
      } else {
        setMembers([]);
        setColumns((cols) => cols.map((c) => ({ ...c, cards: c.cards.map((x) => ({ ...x, assignee: null, assigneeId: null })) })));
      }
      router.refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function deleteBoard() {
    const ok = await confirm({
      title: t("board.deleteBoardConfirm", { name }),
      message: calendarCount > 0 ? t("calendar.deleteParentHint") : t("board.deleteBoardHint"),
      danger: true,
      confirm: t("board.deleteBoard"),
    });
    if (!ok) return;
    try {
      await apiDelete(`/api/boards/${board.id}`);
      router.replace(calendar ? calendarHref : "/boards");
      router.refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function leaveBoard() {
    const ok = await confirm({ title: t("board.leaveConfirm", { name }), danger: true, confirm: t("board.leave") });
    if (!ok) return;
    try {
      await apiDelete(`/api/boards/${board.id}/members?userId=${encodeURIComponent(currentUser.id)}`);
      router.replace("/boards");
      router.refresh();
    } catch (e) {
      toast.error(e);
    }
  }

  async function addColumn(columnName: string) {
    try {
      const { column } = await apiPost<{ column: ColumnRow }>("/api/columns", { boardId: board.id, name: columnName, kind: "TODO" });
      setColumns((c) => [...c, { ...column, cards: column.cards ?? [] }]);
      setDialog(null);
      requestAnimationFrame(() => document.getElementById(`col-${column.id}`)?.scrollIntoView({ behavior: "smooth", inline: "end" }));
    } catch (e) {
      toast.error(e);
    }
  }

  // ---------- Column / card actions (optimistic with rollback) ----------
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  const patchColumn = useCallback(
    async (columnId: string, body: Partial<Pick<ColumnRow, "name" | "color" | "kind">>) => {
      const prev = columnsRef.current;
      setColumns((cols) =>
        cols.map((c) => {
          if (c.id !== columnId) return c;
          const next = { ...c, ...body };
          // Mirror the server: cards in a DONE column are completed.
          if (body.kind && body.kind !== c.kind) {
            const now = new Date();
            next.cards = c.cards.map((x) => ({ ...x, completedAt: body.kind === "DONE" ? (x.completedAt ?? now) : null }));
          }
          return next;
        }),
      );
      try {
        await apiPatch(`/api/columns/${columnId}`, body);
      } catch (e) {
        setColumns(prev);
        toast.error(e);
      }
    },
    [toast],
  );

  const actions = useMemo(
    () => ({
      addCard: async (columnId: string, title: string) => {
        try {
          const { card } = await apiPost<{ card: CardRow }>("/api/cards", { columnId, title });
          setColumns((cols) => cols.map((c) => (c.id === columnId ? { ...c, cards: [...c.cards, card] } : c)));
          return true;
        } catch (e) {
          toast.error(e);
          return false;
        }
      },
      rename: (columnId: string, value: string) => patchColumn(columnId, { name: value }),
      setColor: (columnId: string, color: string | null) => patchColumn(columnId, { color }),
      setKind: (columnId: string, kind: "TODO" | "DOING" | "DONE") => patchColumn(columnId, { kind }),
      remove: async (columnId: string) => {
        const col = columnsRef.current.find((c) => c.id === columnId);
        if (!col) return;
        const ok = await confirm({
          title: t("board.deleteColumnConfirmTitle", { name: col.name }),
          message: col.cards.length ? t("board.deleteColumnConfirm", { count: col.cards.length }) : undefined,
          danger: true,
          confirm: t("board.deleteColumn"),
        });
        if (!ok) return;
        const prev = columnsRef.current;
        setColumns((cols) => cols.filter((c) => c.id !== columnId));
        try {
          await apiDelete(`/api/columns/${columnId}`);
        } catch (e) {
          setColumns(prev);
          toast.error(e);
        }
      },
      openCard: (card: CardRow) => openCard(card.id),
    }),
    [patchColumn, toast, confirm, t, openCard],
  );

  // ---------- Card modal callbacks ----------
  const replaceCard = useCallback((row: CardRow) => {
    setColumns((cols) => cols.map((c) => (c.id === row.columnId ? { ...c, cards: c.cards.map((x) => (x.id === row.id ? { ...x, ...row } : x)) } : c)));
  }, []);

  const moveCardToEnd = useCallback((row: CardRow, fromColumnId: string) => {
    setColumns((cols) =>
      cols.map((c) => {
        if (c.id === fromColumnId) return { ...c, cards: c.cards.filter((x) => x.id !== row.id) };
        if (c.id === row.columnId) return { ...c, cards: [...c.cards.filter((x) => x.id !== row.id), row] };
        return c;
      }),
    );
  }, []);

  const people = isTeam ? members.map((m) => m.user) : [];
  const shownMembers = members.slice(0, 4);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ConfettiOnDoneDrop />

      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 py-3 md:px-6">
        <span className={cn("badge shrink-0", isTeam ? "bg-accent-soft text-accent-fg" : "bg-sunken text-muted")} title={isTeam ? t("boards.team") : t("boards.personalFull")}>
          {isTeam ? <Users size={13} /> : <User size={13} />}
          <span className="hidden sm:inline">{isTeam ? t("boards.team") : t("boards.personalFull")}</span>
        </span>
        {!canEdit && (
          <span className="badge bg-warn-soft text-warn">
            <Eye size={13} /> {t("board.readOnly")}
          </span>
        )}

        {calendar ? (
          <div className="flex items-center gap-1">
            {canEdit && (
              <button
                type="button"
                onClick={() => step(-1)}
                disabled={stepping !== null}
                className="icon-btn border border-line"
                aria-label={calendar.period === "WEEK" ? t("calendar.prevWeek") : t("calendar.prevDay")}
                title={calendar.period === "WEEK" ? t("calendar.prevWeek") : t("calendar.prevDay")}
              >
                {stepping === -1 ? <Loader2 size={15} className="animate-spin" /> : <ChevronLeft size={16} />}
              </button>
            )}
            <Link href={calendarHref} className="btn-secondary btn-sm" title={t("calendar.backToCalendar")}>
              <CalendarDays size={14} /> <span className="hidden sm:inline">{t("calendar.title")}</span>
            </Link>
            {canEdit && (
              <button
                type="button"
                onClick={() => step(1)}
                disabled={stepping !== null}
                className="icon-btn border border-line"
                aria-label={calendar.period === "WEEK" ? t("calendar.nextWeek") : t("calendar.nextDay")}
                title={calendar.period === "WEEK" ? t("calendar.nextWeek") : t("calendar.nextDay")}
              >
                {stepping === 1 ? <Loader2 size={15} className="animate-spin" /> : <ChevronRight size={16} />}
              </button>
            )}
          </div>
        ) : (
          <Link
            href={calendarHref}
            className="btn-secondary btn-sm"
            title={calendarCount > 0 ? t("calendar.daysCount", { count: calendarCount }) : t("calendar.openHint")}
          >
            <CalendarDays size={14} /> <span className="hidden sm:inline">{t("calendar.open")}</span>
            {calendarCount > 0 && <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-semibold tabular-nums text-accent-fg">{calendarCount}</span>}
          </Link>
        )}

        <label className="relative flex h-8 min-w-0 flex-1 items-center sm:ml-2 sm:w-60 sm:flex-none">
          <Search size={14} className="pointer-events-none absolute left-2.5 text-faint" />
          <input
            ref={filterRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder={t("board.filterPlaceholder")}
            aria-label={t("board.filterPlaceholder")}
            className="input h-8 py-0 pl-8 pr-8 text-[13px]"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="absolute right-1.5 text-faint hover:text-fg" aria-label={t("board.clearFilter")}>
              <X size={14} />
            </button>
          ) : (
            <kbd className="kbd absolute right-2 hidden sm:inline">/</kbd>
          )}
        </label>
        {isTeam && (
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => setMine((v) => !v)}
            className={cn("btn-sm btn hidden border sm:inline-flex", mine ? "border-accent/40 bg-accent-soft text-accent-fg" : "border-line bg-surface text-muted hover:bg-hover")}
          >
            {t("board.myCards")}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {isTeam && (
            <button
              type="button"
              onClick={() => setDialog("members")}
              className="hidden items-center rounded-full p-0.5 hover:bg-hover sm:flex"
              aria-label={t("board.members")}
              title={t("board.members")}
            >
              <span className="flex -space-x-1.5">
                {shownMembers.map((m) => (
                  <Avatar key={m.userId} name={m.user.displayName} url={m.user.avatarUrl} size={26} className="ring-2 ring-bg" />
                ))}
              </span>
              {members.length > shownMembers.length && <span className="ml-1.5 pr-1 text-xs font-medium text-muted">+{members.length - shownMembers.length}</span>}
            </button>
          )}
          {isTeam && isOwner && (
            <button type="button" onClick={() => setDialog("members")} className="btn-secondary btn-sm hidden sm:inline-flex">
              <UserPlus size={14} /> {t("board.invite")}
            </button>
          )}
          <button type="button" onClick={() => setDialog("labels")} className="btn-secondary btn-sm hidden sm:inline-flex">
            <Tag size={14} /> {t("card.labels")}
          </button>
          {(
            <Menu
              label={t("board.boardMenu")}
              trigger={(p) => (
                <button type="button" {...p} className="icon-btn border border-line" aria-label={t("board.boardMenu")}>
                  <MoreHorizontal size={16} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <div className="sm:hidden">
                    {isTeam && (
                      <MenuItem checked={mine} icon={<User size={15} />} onClick={() => { close(); setMine((v) => !v); }}>
                        {t("board.myCards")}
                      </MenuItem>
                    )}
                    <MenuItem icon={<Tag size={15} />} onClick={() => { close(); setDialog("labels"); }}>
                      {t("card.labels")}
                    </MenuItem>
                    <MenuSeparator />
                  </div>
                  {isOwner && (
                    <MenuItem icon={<Pencil size={15} />} onClick={() => { close(); setDialog("rename"); }}>
                      {t("board.renameBoard")}
                    </MenuItem>
                  )}
                  {isOwner && !calendar && (
                    <MenuItem icon={isTeam ? <User size={15} /> : <Users size={15} />} onClick={() => { close(); toggleType(); }}>
                      {isTeam ? t("board.makePersonal") : t("board.makeTeam")}
                    </MenuItem>
                  )}
                  {isTeam && (
                    <MenuItem icon={isOwner ? <UserPlus size={15} /> : <Users size={15} />} onClick={() => { close(); setDialog("members"); }}>
                      {isOwner ? t("board.inviteMember") : t("board.members")}
                    </MenuItem>
                  )}
                  {!isOwner && isTeam && canEdit && (
                    <>
                      <MenuSeparator />
                      <MenuItem danger icon={<LogOut size={15} />} onClick={() => { close(); leaveBoard(); }}>
                        {t("board.leave")}
                      </MenuItem>
                    </>
                  )}
                  {isOwner && (
                    <>
                      <MenuSeparator />
                      <MenuItem danger icon={<Trash2 size={15} />} onClick={() => { close(); deleteBoard(); }}>
                        {t("board.deleteBoard")}
                      </MenuItem>
                    </>
                  )}
                </>
              )}
            </Menu>
          )}
        </div>
      </div>

      {visible && (
        <p className="px-4 pb-2 text-xs text-muted md:px-6" role="status">
          {t("board.filterResult", { count: visible.size })} · {t("board.dragDisabledWhileFiltering")}
        </p>
      )}

      <div className="min-h-0 flex-1">
        <Kanban
          columns={columns}
          setColumns={setColumns}
          visible={visible}
          canEdit={canEdit}
          isOwner={isOwner}
          actions={actions}
          onAddColumn={canEdit ? () => setDialog("column") : undefined}
        />
      </div>

      {openCardId && (
        <CardModal
          key={openCardId}
          cardId={openCardId}
          columns={columns}
          labels={labels}
          people={people}
          canEdit={canEdit}
          isOwner={isOwner}
          currentUser={currentUser}
          onClose={() => openCard(null)}
          onChange={replaceCard}
          onMoved={moveCardToEnd}
          onDeleted={(cardId, columnId) =>
            setColumns((cols) => cols.map((c) => (c.id === columnId ? { ...c, cards: c.cards.filter((x) => x.id !== cardId) } : c)))
          }
          onLabelCreated={(label) => setLabels((ls) => [...ls, label].sort((a, b) => a.name.localeCompare(b.name)))}
        />
      )}

      <MembersDialog
        open={dialog === "members"}
        onClose={() => setDialog(null)}
        boardId={board.id}
        ownerId={board.ownerId}
        members={members}
        isOwner={isOwner}
        currentUserId={currentUser.id}
        onAdded={(m) => setMembers((ms) => (ms.some((x) => x.userId === m.userId) ? ms : [...ms, m]))}
        onRemoved={(userId) => {
          setMembers((ms) => ms.filter((m) => m.userId !== userId));
          setColumns((cols) =>
            cols.map((c) => ({ ...c, cards: c.cards.map((x) => (x.assigneeId === userId ? { ...x, assignee: null, assigneeId: null } : x)) })),
          );
        }}
      />
      <LabelsDialog
        open={dialog === "labels"}
        onClose={() => setDialog(null)}
        boardId={board.id}
        labels={labels}
        canEdit={canEdit}
        isOwner={isOwner}
        onChange={(label) => {
          setLabels((ls) => [...ls.filter((l) => l.id !== label.id), label].sort((a, b) => a.name.localeCompare(b.name)));
          setColumns((cols) =>
            cols.map((c) => ({ ...c, cards: c.cards.map((x) => ({ ...x, labels: x.labels.map((l) => (l.label.id === label.id ? { label } : l)) })) })),
          );
        }}
        onDeleted={(id) => {
          setLabels((ls) => ls.filter((l) => l.id !== id));
          setColumns((cols) => cols.map((c) => ({ ...c, cards: c.cards.map((x) => ({ ...x, labels: x.labels.filter((l) => l.label.id !== id) })) })));
        }}
      />
      <NameDialog
        open={dialog === "rename"}
        onClose={() => setDialog(null)}
        title={t("board.renameBoard")}
        label={t("boards.newModal.name")}
        initial={name}
        submit={t("common.save")}
        maxLength={120}
        onSubmit={rename}
      />
      <NameDialog
        open={dialog === "column"}
        onClose={() => setDialog(null)}
        title={t("board.addColumn")}
        label={t("board.columnNamePrompt")}
        submit={t("board.add")}
        maxLength={80}
        onSubmit={addColumn}
      />
    </div>
  );
}
