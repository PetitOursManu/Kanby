"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, CircleHelp, KanbanSquare, LogOut, Menu, Shield, UserRound, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useLogout } from "@/components/LogoutButton";
import { ToastProvider } from "@/components/Toast";
import { ConfirmProvider } from "@/components/Confirm";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

export type NavKey = "boards" | "profile" | "admin" | "help";

type ShellUser = { displayName: string; avatarUrl: string | null; isAdmin: boolean };
type RecentBoard = { id: string; name: string; type: "PERSONAL" | "TEAM" };

function SidebarContent({
  user,
  recent,
  active,
  onNavigate,
}: {
  user: ShellUser;
  recent: RecentBoard[];
  active?: NavKey;
  onNavigate?: () => void;
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  const logout = useLogout();

  const links = [
    { href: "/boards", key: "boards", label: t("nav.boards"), Icon: KanbanSquare },
    { href: "/profile", key: "profile", label: t("nav.profile"), Icon: UserRound },
    ...(user.isAdmin ? [{ href: "/admin", key: "admin", label: t("nav.admin"), Icon: Shield }] : []),
    { href: "/help", key: "help", label: t("nav.help"), Icon: CircleHelp },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center px-4">
        <Link href="/boards" onClick={onNavigate} aria-label="Kanby">
          <Logo />
        </Link>
      </div>

      <nav className="flex flex-col gap-0.5 px-3 pt-2" aria-label={t("nav.main")}>
        {links.map(({ href, key, label, Icon }) => {
          const isActive = active === key;
          return (
            <Link
              key={key}
              href={href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] transition-colors",
                isActive ? "bg-accent-soft font-medium text-accent-fg" : "text-muted hover:bg-hover hover:text-fg",
              )}
            >
              <Icon size={17} strokeWidth={1.8} />
              {label}
            </Link>
          );
        })}
      </nav>

      {recent.length > 0 && (
        <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
          <p className="section-title px-2.5 pb-1.5">{t("nav.recent")}</p>
          <ul className="flex flex-col gap-0.5">
            {recent.map((b) => {
              const isActive = pathname === `/boards/${b.id}`;
              return (
                <li key={b.id}>
                  <Link
                    href={`/boards/${b.id}`}
                    onClick={onNavigate}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors",
                      isActive ? "bg-accent-soft text-accent-fg" : "text-muted hover:bg-hover hover:text-fg",
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", isActive ? "bg-accent" : "bg-line-strong")} />
                    <span className="truncate">{b.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="mt-auto shrink-0 border-t border-line p-3">
        <div className="flex items-center gap-2.5">
          <Link href="/profile" onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg p-1 hover:bg-hover">
            <Avatar name={user.displayName} url={user.avatarUrl} size={32} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[13px] font-medium text-fg">{user.displayName}</span>
              <span className="block truncate text-[11.5px] text-faint">
                {user.isAdmin ? t("profile.admin") : t("profile.user")}
              </span>
            </span>
          </Link>
          <button type="button" onClick={logout} className="icon-btn" aria-label={t("nav.logout")} title={t("nav.logout")}>
            <LogOut size={16} />
          </button>
        </div>
        <ThemeToggle className="mt-2.5 w-full justify-between [&>button]:flex-1" />
      </div>
    </div>
  );
}

export function ShellFrame({
  user,
  recent,
  active,
  wide,
  title,
  crumbs,
  children,
}: {
  user: ShellUser;
  recent: RecentBoard[];
  active?: NavKey;
  wide?: boolean;
  title?: string;
  crumbs?: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  useEffect(() => setDrawer(false), [pathname]);

  return (
    <ToastProvider>
    <ConfirmProvider>
    <div className="min-h-dvh bg-bg">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[60] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        {t("nav.skipToContent")}
      </a>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-line bg-surface md:block">
        <SidebarContent user={user} recent={recent} active={active} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 380, damping: 38 }}
              className="fixed inset-y-0 left-0 z-50 w-[17rem] max-w-[85vw] border-r border-line bg-surface md:hidden"
              role="dialog"
              aria-modal="true"
              aria-label={t("nav.main")}
            >
              <button type="button" onClick={() => setDrawer(false)} className="icon-btn absolute right-3 top-3" aria-label={t("common.close")}>
                <X size={18} />
              </button>
              <SidebarContent user={user} recent={recent} active={active} onNavigate={() => setDrawer(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-h-dvh flex-col md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-6">
          <button type="button" onClick={() => setDrawer(true)} className="icon-btn -ml-1.5 md:hidden" aria-label={t("nav.openMenu")}>
            <Menu size={19} />
          </button>
          <nav aria-label={t("nav.breadcrumb")} className="flex min-w-0 flex-1 items-center gap-1.5 text-[13.5px] text-muted">
            {crumbs?.map((c) => (
              <span key={c.href} className="flex shrink-0 items-center gap-1.5">
                <Link href={c.href} className="hover:text-fg hover:underline">
                  {c.label}
                </Link>
                <ChevronRight size={14} className="text-faint" />
              </span>
            ))}
            {title && <h1 className="truncate font-semibold text-fg">{title}</h1>}
          </nav>
          <NotificationsBell />
        </header>

        <main id="main" className={cn("flex-1", wide ? "flex min-h-0 flex-col" : "mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8")}>
          {children}
        </main>
      </div>
    </div>
    </ConfirmProvider>
    </ToastProvider>
  );
}
