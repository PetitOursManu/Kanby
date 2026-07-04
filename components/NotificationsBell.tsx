"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/Avatar";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

type NotifItem = {
  id: string;
  kind: string;
  message: string;
  read: boolean;
  createdAt: string;
  actor: { id: string; displayName: string; avatarUrl: string | null } | null;
  board: { id: string; name: string } | null;
  card: { id: string; title: string } | null;
};

const KIND_ICONS: Record<string, string> = {
  card_assigned: "person",
  card_moved: "swap_horiz",
  card_updated: "edit",
  card_commented: "comment",
  member_added: "person_add",
  member_removed: "person_remove",
  board_updated: "edit",
  column_added: "add",
  column_deleted: "delete",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString();
}

export function NotificationsBell() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotifItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/notifications");
    if (res.ok) {
      const data = await res.json();
      setItems(data.notifications || []);
      setUnread(data.unreadCount || 0);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // Poll every 30 seconds for new notifications.
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  async function markAllRead() {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setItems((arr) => arr.map((n) => ({ ...n, read: true })));
    setUnread(0);
  }

  async function markOne(id: string) {
    await fetch("/api/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setItems((arr) => arr.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) load();
        }}
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-primary/5 hover:text-primary"
        aria-label={t("notif.title")}
        title={t("notif.title")}
      >
        <Icon name="notifications" size={18} />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-on-primary shadow-glow-sm">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            className="glass-elevated absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-xl p-2 shadow-lift"
          >
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-sm font-semibold text-on-surface">{t("notif.title")}</span>
              {unread > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs text-primary transition-colors hover:underline"
                >
                  {t("notif.markAllRead")}
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto">
              {loading && items.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-on-surface-variant">…</p>
              ) : items.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-on-surface-variant">{t("notif.empty")}</p>
              ) : (
                <ul className="space-y-0.5">
                  {items.map((n) => {
                    const href = n.board ? `/boards/${n.board.id}` : null;
                    const inner = (
                      <div
                        className={cn(
                          "flex gap-2.5 rounded-lg px-3 py-2.5 transition-colors",
                          !n.read && "bg-primary/5",
                          href && "hover:bg-primary/10 cursor-pointer",
                        )}
                        onClick={() => {
                          if (!n.read) markOne(n.id);
                          if (href) setOpen(false);
                        }}
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                          <Icon name={KIND_ICONS[n.kind] ?? "notifications"} size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug text-on-surface">{n.message}</p>
                          <p className="mt-0.5 text-xs text-on-surface-variant">{timeAgo(n.createdAt)}</p>
                        </div>
                        {!n.read && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                        )}
                      </div>
                    );
                    return (
                      <li key={n.id}>
                        {href ? (
                          <Link href={href}>{inner}</Link>
                        ) : (
                          inner
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