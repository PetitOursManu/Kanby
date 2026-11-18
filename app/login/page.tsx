import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { LoginForm } from "./LoginForm";
import { isKosmyEnabled } from "@/lib/kosmy-board/server";
import { getSessionUser } from "@/lib/auth/session";
import { registrationAllowed } from "@/lib/registration";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/boards");
  const kosmyEnabled = await isKosmyEnabled();
  return (
    <I18nProvider locale={getServerLocale()}>
      <Suspense fallback={<div className="min-h-dvh bg-bg" />}>
        <LoginForm kosmyEnabled={kosmyEnabled} allowRegistration={registrationAllowed()} />
      </Suspense>
    </I18nProvider>
  );
}
