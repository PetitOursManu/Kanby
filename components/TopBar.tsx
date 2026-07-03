"use client";

import Link from "next/link";
import { useState } from "react";
import { MobileNav } from "@/components/MobileNav";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ThemeToggle } from "@/components/ThemeToggle";

type LinkItem = { href: string; label: string; key: string; icon: string };

export function TopBar({
  user,
  links,
  active,
}: {
  user: { displayName: string; avatarUrl: string | null };
  links: LinkItem[];
  active?: string;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-20 flex h-16 items-center justify-between border-b border-primary/10 bg-surface/60 px-4 backdrop-blur-xl md:left-64 md:px-8">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/20 text-on-surface-variant transition-colors hover:bg-primary/5 hover:text-primary md:hidden"
          >
            <Icon name="menu" size={20} />
          </button>

          <div className="relative hidden w-64 sm:block">
            <Icon
              name="search"
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
            />
            <input
              type="text"
              readOnly
              placeholder="Rechercher..."
              className="w-full rounded-full border border-primary/10 bg-surface-dim/50 py-1.5 pl-9 pr-4 text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:border-primary/40 focus:bg-surface-dim/80 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button className="relative flex h-9 w-9 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-primary/5 hover:text-primary">
            <Icon name="notifications" size={18} />
            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary shadow-glow-sm"></span>
          </button>
          <Link
            href="/profile"
            className="ml-1 flex items-center gap-2 rounded-full py-1 pl-1 transition-colors sm:border sm:border-primary/20 sm:bg-surface-container/50 sm:pr-3 sm:hover:border-primary/40"
          >
            <Avatar name={user.displayName} url={user.avatarUrl} size={28} />
            <span className="hidden max-w-[10rem] truncate text-sm font-medium text-on-surface sm:inline">
              {user.displayName}
            </span>
          </Link>
        </div>
      </header>

      <MobileNav
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        user={user}
        links={links}
        active={active}
      />
    </>
  );
}
