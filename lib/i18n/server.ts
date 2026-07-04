import { cookies } from "next/headers";
import { getTranslator, parseLocale, DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

/** Read the locale from the cookie (server-side). */
export function getServerLocale(): Locale {
  const store = cookies();
  return parseLocale(store.get("kanby_locale")?.value);
}

/** Get a translator for the current request's locale (server-side). */
export function getServerTranslator() {
  return getTranslator(getServerLocale());
}

export { DEFAULT_LOCALE, type Locale };