import Link from "next/link";
import { getSessionUser } from "@/lib/auth/session";
import { Avatar } from "@/components/Avatar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { MobileNav } from "@/components/MobileNav";
import { cn } from "@/lib/utils";

export async function AppShell({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: "boards" | "profile" | "admin";
}) {
  const user = await getSessionUser();
  if (!user) return null;

  const links = [
    { href: "/boards", label: "Tableaux", key: "boards" as const },
    { href: "/profile", label: "Profil", key: "profile" as const },
    ...(user.globalRole === "ADMIN"
      ? [{ href: "/admin", label: "Admin", key: "admin" as const }]
      : []),
  ];

  return (
    <div className="min-h-dvh">
      <header className="surface sticky top-0 z-30 border-b">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
          <Link href="/boards" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-600 text-white text-sm shadow-soft">
              K
            </span>
            <span className="hidden sm:inline">Kanby</span>
          </Link>

          <nav className="ml-4 hidden md:flex items-center gap-1">
            {links.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                  active === l.key
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <LogoutButton className="btn-ghost h-9 w-9 !px-0 rounded-full border" />
            <Link
              href="/profile"
              className="flex items-center gap-2 rounded-full pl-1 pr-3 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Avatar name={user.displayName} url={user.avatarUrl} size={28} />
              <span className="hidden sm:inline text-sm font-medium max-w-[10rem] truncate">
                {user.displayName}
              </span>
            </Link>
          </div>
        </div>
      </header>

      <MobileNav links={links} active={active} />

      <main className="mx-auto max-w-6xl px-4 py-6 md:py-8 pb-24 md:pb-8">{children}</main>
    </div>
  );
}