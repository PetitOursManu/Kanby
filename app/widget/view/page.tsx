import type { Metadata } from "next";
import { resolveApiTokenUser } from "@/lib/auth/token";
import { buildWidgetSummary } from "@/lib/widget-summary";
import { Icon } from "@/components/Icon";
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
  searchParams: { token?: string };
}) {
  const user = await resolveApiTokenUser(searchParams.token ?? null);
  const locale = getServerLocale();
  const t = getServerTranslator();

  if (!user) {
    return (
      <I18nProvider locale={locale}>
        <WidgetShell>
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/20 text-primary">
              <Icon name="ac_unit" size={18} />
            </div>
            <p className="text-sm text-on-surface-variant">{t("api.tokenInvalid")}</p>
          </div>
        </WidgetShell>
      </I18nProvider>
    );
  }

  const summary = await buildWidgetSummary(user);
  return (
    <I18nProvider locale={locale}>
      <WidgetShell>
        <WidgetViewClient summary={summary} displayName={user.displayName} />
      </WidgetShell>
    </I18nProvider>
  );
}

/** Compact dark wrapper styled to look good in a small iframe. */
function WidgetShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-background p-3 text-on-surface">
      <div className="mx-auto max-w-sm">{children}</div>
    </div>
  );
}