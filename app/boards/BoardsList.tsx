"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Modal } from "@/components/Modal";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

type BoardItem = {
  id: string;
  name: string;
  type: "PERSONAL" | "TEAM";
  cardsCount: number;
  role: "OWNER" | "MEMBER";
};

export function BoardsList({ owned, member }: { owned: BoardItem[]; member: BoardItem[] }) {
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="glass-panel relative overflow-hidden rounded-xl p-6">
        <div className="absolute left-0 top-0 h-full w-1 bg-gradient-to-b from-primary to-transparent"></div>
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-on-surface">{t("boards.title")}</h1>
            <p className="text-sm text-on-surface-variant">{t("boards.subtitle")}</p>
          </div>
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Icon name="add" size={16} />
            {t("boards.new")}
          </button>
        </div>
      </div>

      {owned.length > 0 && (
        <Section title={t("boards.personalOwned")}>
          <Grid items={owned} />
        </Section>
      )}

      {member.length > 0 && (
        <Section title={t("boards.teamShared")}>
          <Grid items={member} />
        </Section>
      )}

      {owned.length === 0 && member.length === 0 && (
        <div className="glass-elevated flex flex-col items-center justify-center gap-4 rounded-2xl p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/20 text-primary">
            <Icon name="add" size={28} />
          </div>
          <div>
            <p className="font-medium text-on-surface">{t("boards.empty")}</p>
            <p className="text-sm text-on-surface-variant">{t("boards.emptyHint")}</p>
          </div>
          <button onClick={() => setCreating(true)} className="btn-primary">
            {t("boards.create")}
          </button>
        </div>
      )}

      <CreateBoardModal open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-primary">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ items }: { items: BoardItem[] }) {
  const { t } = useI18n();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence>
        {items.map((b) => (
          <motion.div key={b.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }}>
            <Link
              href={`/boards/${b.id}`}
              className="glass-panel group block rounded-xl p-4 transition-all hover:border-primary/30 hover:bg-surface/80 hover:shadow-glow"
            >
              <div className="flex items-start justify-between">
                <span className="font-medium text-on-surface group-hover:text-primary transition-colors">{b.name}</span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium border",
                    b.type === "TEAM"
                      ? "bg-tertiary/10 text-tertiary border-tertiary/20"
                      : "bg-primary/10 text-primary border-primary/20",
                  )}
                >
                  {b.type === "TEAM" ? t("boards.team") : t("boards.personal")}
                </span>
              </div>
              <p className="mt-3 text-xs text-on-surface-variant">
                {b.cardsCount} {b.cardsCount > 1 ? t("boards.tasks") : t("boards.task")} · {b.role === "OWNER" ? t("boards.owner") : t("boards.member")}
              </p>
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function CreateBoardModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [type, setType] = useState<"PERSONAL" | "TEAM">("PERSONAL");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/boards", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type }),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      window.location.href = `/boards/${data.board.id}`;
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || t("misc.error"));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t("boards.newModal.title")}>
      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-on-surface">{t("boards.newModal.name")}</span>
          <input
            autoFocus
            className="input mt-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("boards.newModal.namePlaceholder")}
          />
        </label>

        <div>
          <span className="text-sm font-medium text-on-surface">{t("boards.newModal.type")}</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["PERSONAL", "TEAM"] as const).map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setType(tp)}
                className={cn(
                  "rounded-xl border px-3 py-2.5 text-left text-sm transition-colors",
                  type === tp
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-primary/10 text-on-surface-variant hover:bg-primary/5",
                )}
              >
                <span className="block font-medium text-on-surface">{tp === "PERSONAL" ? t("boards.personalFull") : t("boards.team")}</span>
                <span className="text-xs text-on-surface-variant">
                  {tp === "PERSONAL" ? t("boards.newModal.personalHint") : t("boards.newModal.teamHint")}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-error">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost">{t("boards.newModal.cancel")}</button>
          <button onClick={create} disabled={saving || !name.trim()} className="btn-primary">
            {saving ? t("boards.newModal.submitting") : t("boards.newModal.submit")}
          </button>
        </div>
      </div>
    </Modal>
  );
}