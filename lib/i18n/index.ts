/**
 * Lightweight i18n system for Kanby.
 *
 * The active locale is stored in a cookie (`kanby_locale`) set by the
 * LanguageToggle component. Server components read it via `cookies()`,
 * client components receive the locale via props/context.
 *
 * Usage:
 *   const t = getTranslator(locale);
 *   t("boards.title") // → "Mes tableaux" / "My boards"
 */

export type Locale = "fr" | "en";

export const DEFAULT_LOCALE: Locale = "fr";
export const LOCALE_COOKIE = "kanby_locale";
export const LOCALES: Locale[] = ["fr", "en"];

import { fr } from "@/lib/i18n/fr";
import { en } from "@/lib/i18n/en";

const dictionaries: Record<Locale, Record<string, string>> = { fr, en };

export function getTranslator(locale: Locale) {
  const dict = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  return function t(key: string, vars?: Record<string, string | number>): string {
    // Simple plural: "<key>_one" is used when vars.count === 1.
    const k = vars?.count === 1 && (dict[`${key}_one`] ?? dictionaries[DEFAULT_LOCALE][`${key}_one`]) ? `${key}_one` : key;
    let s = dict[k] ?? dictionaries[DEFAULT_LOCALE][k] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return s;
  };
}

export type Translator = ReturnType<typeof getTranslator>;

/** Parse a locale string from a cookie/header value. Falls back to default. */
export function parseLocale(value: string | null | undefined): Locale {
  if (value === "en") return "en";
  return "fr";
}
/**
 * API routes answer with French messages. Translate a known message into the
 * given locale (falls back to the original text).
 */
const reverseApi = new Map<string, string>(
  Object.entries(fr)
    .filter(([k]) => k.startsWith("api."))
    .map(([k, v]) => [v, k]),
);
export function translateApiError(message: string, t: Translator): string {
  const key = reverseApi.get(message);
  return key ? t(key) : message;
}
