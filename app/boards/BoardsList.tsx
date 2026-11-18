"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KanbanSquare, Plus, User, Users } from "lucide-react";
import { Modal } from "@/components/Modal";
import { useToast } from "@/components/Toast";
import { apiPost } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { TimeAgo } from "@/components/TimeAgo";

export type BoardSummary = {
  id: string;
  name: string;
  type: "PERSONAL" | "TEAM";
  role: "OWNER" | "MEMBER";
  cardsCount: number;
  doneCount: number;
  membersCount: number;
  updatedAt: string;
  ownerName?: string;
};

export function BoardsList({ owned, member }: { owned: BoardSummary[]; member: BoardSummary[] }) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const empty = owned.length === 0 && member.length === 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-fg">{t("boards.title")}</h2>
          <p className="mt-1 text-sm text-muted">{t("boards.subtitle")}</p>
        </div>
        <button type="button" onClick={() => setCreating(true)} className="btn-primary">
          <Plus size={16} /> {t("boards.new")}
        </button>
      </div>

      {empty ? (
        <div className="panel flex flex-col items-center px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-soft text-accent-fg">
            <KanbanSquare size={22} />
          </span>
          <h3 className="mt-4 text-base font-semibold text-fg">{t("boards.empty")}</h3>
          <p className="mt-1 max-w-sm text-sm text-muted">{t("boards.emptyHint")}</p>
          <button type="button" onClick={() => setCreating(true)} className="btn-primary mt-6">
            <Plus size={16} /> {t("boards.create")}
          </button>
        </div>
      ) : (
        <>
          <Section title={t("boards.mine")} boards={owned} empty={t("boards.noneOwned")} />
          {member.length > 0 && <Section title={t("boards.teamShared")} boards={member} />}
        </>
      )}

      <CreateBoardModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function Section({ title, boards, empty }: { title: string; boards: BoardSummary[]; empty?: string }) {
  return (
    <section>
      <h3 className="section-title mb-3">
        {title} <span className="ml-1 font-medium normal-case tracking-normal text-faint">{boards.length}</span>
      </h3>
      {boards.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <li key={b.id}>
              <BoardCard board={b} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function BoardCard({ board }: { board: BoardSummary }) {
  const { t } = useI18n();
  const progress = board.cardsCount ? Math.round((board.doneCount / board.cardsCount) * 100) : 0;
  return (
    <Link
      href={`/boards/${board.id}`}
      className="group flex h-full flex-col rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-line-strong"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunken text-muted group-hover:text-accent-fg">
          {board.type === "TEAM" ? <Users size={17} /> : <KanbanSquare size={17} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-fg">{board.name}</p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {board.role === "OWNER" ? t("boards.owner") : t("boards.sharedBy", { name: board.ownerName ?? "?" })}
          </p>
        </div>
        <span className={cn("badge shrink-0", board.type === "TEAM" ? "bg-accent-soft text-accent-fg" : "bg-sunken text-muted")}>
          {board.type === "TEAM" ? <Users size={12} /> : <User size={12} />}
          {board.type === "TEAM" ? t("boards.team") : t("boards.personal")}
        </span>
      </div>
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted">
          <span>{t("boards.tasksCount", { count: board.cardsCount })}</span>
          <span className="tabular-nums">{t("boards.donePercent", { percent: progress })}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <p className="mt-3 text-xs text-faint">
        <TimeAgo date={board.updatedAt} prefix={(when) => t("boards.updated", { when })} />
      </p>
    </Link>
  );
}

function CreateBoardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"PERSONAL" | "TEAM">("PERSONAL");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || loading) return;
    setLoading(true);
    try {
      const { board } = await apiPost<{ board: { id: string } }>("/api/boards", { name: name.trim(), type });
      router.push(`/boards/${board.id}`);
      router.refresh();
    } catch (err) {
      toast.error(err);
      setLoading(false);
    }
  }

  const options = [
    { value: "PERSONAL" as const, label: t("boards.personalFull"), hint: t("boards.newModal.personalHint"), Icon: User },
    { value: "TEAM" as const, label: t("boards.team"), hint: t("boards.newModal.teamHint"), Icon: Users },
  ];

  return (
    <Modal open={open} onClose={onClose} title={t("boards.newModal.title")} size="sm">
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor="board-name" className="label">
            {t("boards.newModal.name")}
          </label>
          <input
            id="board-name"
            data-autofocus
            className="input"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("boards.newModal.namePlaceholder")}
          />
        </div>
        <fieldset>
          <legend className="label">{t("boards.newModal.type")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {options.map(({ value, label, hint, Icon }) => (
              <label
                key={value}
                className={cn(
                  "cursor-pointer rounded-lg border p-3 transition-colors",
                  type === value ? "border-accent bg-accent-soft" : "border-line hover:bg-hover",
                )}
              >
                <input type="radio" name="type" value={value} checked={type === value} onChange={() => setType(value)} className="sr-only" />
                <span className={cn("flex items-center gap-1.5 text-sm font-medium", type === value ? "text-accent-fg" : "text-fg")}>
                  <Icon size={15} /> {label}
                </span>
                <span className="mt-1 block text-xs text-muted">{hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <p className="text-xs text-muted">{t("boards.newModal.columnsHint")}</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary">
            {t("boards.newModal.cancel")}
          </button>
          <button type="submit" disabled={loading || !name.trim()} className="btn-primary">
            {loading ? t("boards.newModal.submitting") : t("boards.newModal.submit")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
