import { Suspense } from "react";
import { getServerLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  const locale = getServerLocale();
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <I18nProvider locale={locale}>
        <LoginForm />
      </I18nProvider>
    </Suspense>
  );
}