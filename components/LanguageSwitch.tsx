"use client";

import { useChangeLocale, useI18n } from "@/lib/i18n/client";
import { LOCALES } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** FR / EN segmented switch. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const { change, changing } = useChangeLocale();
  return (
    <div role="radiogroup" aria-label={t("profile.language")} className={cn("inline-flex rounded-lg border border-line p-0.5", className)}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          role="radio"
          aria-checked={locale === l}
          disabled={changing}
          onClick={() => locale !== l && change(l)}
          className={cn(
            "h-7 rounded-md px-2.5 text-xs font-semibold uppercase transition-colors",
            locale === l ? "bg-accent-soft text-accent-fg" : "text-faint hover:text-fg",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
