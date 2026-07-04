import { getSessionUser } from "@/lib/auth/session";
import { getServerLocale } from "@/lib/i18n/server";
import { getServerTranslator } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";
import { cn } from "@/lib/utils";

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

  const locale = getServerLocale();
  const t = getServerTranslator();

  const links = [
    { href: "/boards", label: t("nav.boards"), key: "boards", icon: "dashboard" },
    { href: "/profile", label: t("nav.profile"), key: "profile", icon: "settings" },
    ...(user.globalRole === "ADMIN"
      ? [{ href: "/admin", label: t("nav.admin"), key: "admin", icon: "workspaces" }]
      : []),
  ];

  return (
    <I18nProvider locale={locale}>
      <div className="min-h-dvh bg-background">
        <Sidebar user={user} links={links} active={active} />
        <TopBar user={user} links={links} active={active} />

        <main
          className={cn(
            "mt-16 min-h-[calc(100dvh-4rem)] md:ml-64",
            wide ? "w-full" : "mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8",
          )}
        >
          {children}
        </main>
      </div>
    </I18nProvider>
  );
}
