import type { Metadata } from "next";
import { resolveApiTokenUser } from "@/lib/auth/token";
import { buildWidgetSummary } from "@/lib/widget-summary";
import { LogoMark } from "@/components/Logo";
import { WidgetViewClient } from "./WidgetViewClient";
import { getServerLocale } from "@/lib/i18n/server";
import { getServerTranslator } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";

export const runtime = "nodejs";

export async function generateMetadata(): Promise<Metadata> {
  const t = getServerTranslator();
  return {
    title: t("widget.title"),
    robots: { index: false, follow: false },
  };
}

export default async function WidgetViewPage({
  searchParams,
}: {
  searchParams: { token?: string; theme?: string };
}) {
  // Dashboards are usually dark: ?theme=light switches the widget to light.
  const theme = searchParams.theme === "light" ? "light" : "dark";
  const user = await resolveApiTokenUser(searchParams.token ?? null);
  const locale = getServerLocale();
  const t = getServerTranslator();

  if (!user) {
    return (
      <I18nProvider locale={locale}>
        <WidgetShell theme={theme}>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <LogoMark size={36} />
            <p className="text-sm text-muted">{t("api.tokenInvalid")}</p>
          </div>
        </WidgetShell>
      </I18nProvider>
    );
  }

  const summary = await buildWidgetSummary(user);
  return (
    <I18nProvider locale={locale}>
      <WidgetShell theme={theme}>
        <WidgetViewClient summary={summary} displayName={user.displayName} />
      </WidgetShell>
    </I18nProvider>
  );
}

/** Compact dark wrapper styled to look good in a small iframe. */
function WidgetShell({ children, theme }: { children: React.ReactNode; theme: "light" | "dark" }) {
  return (
    <div className={`${theme} min-h-dvh w-full bg-bg p-3 text-fg`}>
      <div className="mx-auto max-w-sm">{children}</div>
    </div>
  );
}