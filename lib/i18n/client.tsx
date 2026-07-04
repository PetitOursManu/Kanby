"use client";

import { useState, useCallback, useMemo, createContext, useContext } from "react";
import { getTranslator, type Locale, DEFAULT_LOCALE, type Translator } from "@/lib/i18n";

/**
 * Client-side i18n context. Provides a `t()` function and the current locale
 * to all child components without prop-drilling.
 */
const I18nContext = createContext<{ locale: Locale; t: Translator }>({
  locale: DEFAULT_LOCALE,
  t: getTranslator(DEFAULT_LOCALE),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({
    locale,
    t: getTranslator(locale),
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** Hook to access the translator and locale in client components. */
export function useI18n() {
  return useContext(I18nContext);
}

/** Hook to change the locale client-side (calls the API + reloads). */
export function useChangeLocale() {
  const [changing, setChanging] = useState(false);
  const change = useCallback(async (locale: Locale) => {
    setChanging(true);
    try {
      await fetch("/api/me/language", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      // Reload to pick up the new cookie server-side.
      window.location.reload();
    } finally {
      setChanging(false);
    }
  }, []);
  return { change, changing };
}