import { redirect } from "next/navigation";
import { getServerLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { getSessionUser } from "@/lib/auth/session";
import { registrationAllowed } from "@/lib/registration";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  if (await getSessionUser()) redirect("/boards");
  return (
    <I18nProvider locale={getServerLocale()}>
      <RegisterForm allowed={await registrationAllowed()} />
    </I18nProvider>
  );
}
