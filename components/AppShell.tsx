import { getSessionUser } from "@/lib/auth/session";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/boards", label: "Tableaux", key: "boards", icon: "dashboard" },
  { href: "/profile", label: "Profil", key: "profile", icon: "settings" },
];

export async function AppShell({
  children,
  active,
  wide,
}: {
  children: React.ReactNode;
  active?: "boards" | "profile" | "admin";
  wide?: boolean;
}) {
  const user = await getSessionUser();
  if (!user) return null;

  const links = [
    ...LINKS,
    ...(user.globalRole === "ADMIN"
      ? [{ href: "/admin", label: "Admin", key: "admin", icon: "workspaces" }]
      : []),
  ];

  return (
    <div className="min-h-dvh bg-background">
      <Sidebar user={user} links={links} active={active} />
      <TopBar user={user} links={links} active={active} />

      <main
        className={cn(
          "mt-16 min-h-[calc(100dvh-4rem)] md:ml-64",
          wide ? "w-full px-4 md:px-6" : "mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8",
        )}
      >
        {children}
      </main>
    </div>
  );
}
