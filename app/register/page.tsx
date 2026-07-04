import { getServerLocale } from "@/lib/i18n/server";
import { I18nProvider } from "@/lib/i18n/client";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage() {
  const locale = getServerLocale();
  return (
    <I18nProvider locale={locale}>
      <RegisterForm />
    </I18nProvider>
  );
}