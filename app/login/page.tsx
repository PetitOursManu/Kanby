import { Suspense } from "react";
import { getServerLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { LoginForm } from "./LoginForm";
import { isKosmyEnabled } from "@/lib/kosmy-board/server";

export default async function LoginPage() {
  const locale = getServerLocale();
  const kosmyEnabled = await isKosmyEnabled();
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <I18nProvider locale={locale}>
        <LoginForm kosmyEnabled={kosmyEnabled} />
      </I18nProvider>
    </Suspense>
  );
}