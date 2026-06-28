import type { Metadata } from "next";
import { resolveApiTokenUser } from "@/lib/auth/token";
import { buildWidgetSummary } from "@/lib/widget-summary";
import { WidgetViewClient } from "./WidgetViewClient";

export const runtime = "nodejs";

export const metadata: Metadata = {
  title: "Kanby — Widget",
  robots: { index: false, follow: false },
};

/**
 * Standalone lightweight page designed to be embedded in a small iframe
 * (e.g. a Dashy widget, ~300-400px wide). No app shell, no navigation.
 * Auth is via a personal API token passed as `?token=kbt_...`.
 *
 * This page is rendered inside the root layout (so it inherits <html>/<body>),
 * but its content is intentionally minimal and uses its own compact styling
 * scoped to a single wrapper so it looks right in a small iframe.
 */
export default async function WidgetViewPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const user = await resolveApiTokenUser(searchParams.token ?? null);

  if (!user) {
    return (
      <WidgetShell>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 font-bold text-white">K</div>
          <p className="text-sm text-slate-400">Token invalide ou manquant.</p>
        </div>
      </WidgetShell>
    );
  }

  const summary = await buildWidgetSummary(user);
  return (
    <WidgetShell>
      <WidgetViewClient summary={summary} displayName={user.displayName} />
    </WidgetShell>
  );
}

/** Compact dark wrapper styled to look good in a small iframe. */
function WidgetShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-dvh w-full p-3 text-slate-100"
      style={{ background: "linear-gradient(160deg, #0f172a 0%, #1e293b 100%)" }}
    >
      <div className="mx-auto max-w-sm">{children}</div>
    </div>
  );
}