"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRightLeft,
  Bell,
  Columns3,
  MessageSquare,
  Pencil,
  Trash2,
  UserMinus,
  UserPlus,
  UserRoundCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";
import { timeAgo } from "@/lib/format";

type NotifItem = {
  id: string;
  kind: string;
  message: string;
  read: boolean;
  createdAt: string;
  board: { id: string; name: string } | null;
  card: { id: string; title: string } | null;
};

const KIND_ICONS: Record<string, LucideIcon> = {
  card_assigned: UserRoundCheck,
  card_moved: ArrowRightLeft,
  card_updated: Pencil,
  card_commented: MessageSquare,
  member_added: UserPlus,
  member_removed: UserMinus,
  board_updated: Pencil,
  column_added: Columns3,
  column_deleted: Trash2,
};

const POLL_MS = 30_000;

export function NotificationsBell() {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setItems(data.notifications || []);
      setUnread(data.unreadCount || 0);
    } catch {
      /* offline: keep the last state */
    } finally {
      setLoaded(true);
    }
  }, []);

  // Poll while the tab is visible.
  useEffect(() => {
    load();
    const tick = () => document.visibilityState === "visible" && load();
    const interval = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function markRead(id?: string) {
    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(id ? { id } : {}),
    }).catch(() => null);
    if (!res?.ok) return;
    setItems((arr) => arr.map((n) => (!id || n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => (id ? Math.max(0, u - 1) : 0));
  }

  const label = unread > 0 ? t("notif.titleUnread", { count: unread }) : t("notif.title");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="icon-btn relative border border-line"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={label}
      >
        <Bell size={16} />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-on-accent">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label={t("notif.title")}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-10 z-50 w-[22rem] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-sm font-semibold text-fg">{t("notif.title")}</span>
              {unread > 0 && (
                <button type="button" onClick={() => markRead()} className="text-xs font-medium text-accent-fg hover:underline">
                  {t("notif.markAllRead")}
                </button>
              )}
            </div>

            <div className="max-h-[22rem] overflow-y-auto p-1.5">
              {!loaded ? (
                <p className="px-3 py-8 text-center text-sm text-muted">{t("card.loading")}</p>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
                  <Bell size={20} className="text-faint" />
                  <p className="text-sm text-muted">{t("notif.empty")}</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {items.map((n) => {
                    const Icon = KIND_ICONS[n.kind] ?? Bell;
                    const href = n.board ? `/boards/${n.board.id}${n.card ? `?card=${n.card.id}` : ""}` : null;
                    const body = (
                      <>
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sunken text-muted">
                          <Icon size={14} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("block text-[13px] leading-snug", n.read ? "text-muted" : "text-fg")}>{n.message}</span>
                          <span className="mt-0.5 block text-xs text-faint">{timeAgo(n.createdAt, locale)}</span>
                        </span>
                        {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label={t("notif.unread")} />}
                      </>
                    );
                    const cls = cn(
                      "flex w-full gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-hover",
                      !n.read && "bg-accent-soft/60",
                    );
                    const onClick = () => {
                      if (!n.read) markRead(n.id);
                      if (href) setOpen(false);
                    };
                    return (
                      <li key={n.id}>
                        {href ? (
                          <Link href={href} className={cls} onClick={onClick}>
                            {body}
                          </Link>
                        ) : (
                          <button type="button" className={cls} onClick={onClick}>
                            {body}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
