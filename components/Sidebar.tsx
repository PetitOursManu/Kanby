import Link from "next/link";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { LogoutButton } from "@/components/LogoutButton";
import { cn } from "@/lib/utils";

type LinkItem = { href: string; label: string; key: string; icon: string };

export function Sidebar({
  user,
  links,
  active,
}: {
  user: { displayName: string; avatarUrl: string | null };
  links: LinkItem[];
  active?: string;
}) {
  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-64 flex-col border-r border-primary/10 bg-surface/60 backdrop-blur-xl shadow-[0_0_30px_rgba(125,211,252,0.05)] md:flex">
      {/* Brand */}
      <div className="flex items-center gap-3 px-6 py-5">
        <img
          src="/Kanby no background.png"
          alt="Kanby"
          className="h-10 w-10 rounded-lg object-contain"
        />
        <div>
          <h1 className="font-headline text-lg font-semibold tracking-tight text-primary glow-text">
            Kanby
          </h1>
        </div>
      </div>

      {/* Primary CTA */}
      <div className="px-4 pb-2">
        <Link
          href="/boards"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-primary/30 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary transition-all hover:bg-primary/25 hover:shadow-glow-sm"
        >
          <Icon name="add" size={16} />
          Nouveau tableau
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {links.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors",
              active === l.key
                ? "border border-primary/20 bg-primary/10 text-primary shadow-glow-sm"
                : "text-on-surface-variant hover:bg-primary/5 hover:text-on-surface",
            )}
          >
            <Icon
              name={l.icon}
              size={18}
              className={cn(
                "transition-colors",
                active === l.key ? "text-primary" : "text-on-surface-variant group-hover:text-primary",
              )}
            />
            {l.label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-primary/10 p-4">
        <div className="mb-3 flex items-center gap-3 px-3 py-2">
          <Avatar name={user.displayName} url={user.avatarUrl} size={32} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-on-surface">{user.displayName}</p>
            <p className="truncate text-xs text-on-surface-variant">Mon compte</p>
          </div>
        </div>
        <div className="space-y-1">
          <Link
            href="/help"
            className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-primary/5 hover:text-on-surface"
          >
            <Icon name="help" size={18} />
            Aide
          </Link>
          <LogoutButton
            showLabel
            className="flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
          />
        </div>
      </div>
    </aside>
  );
}
