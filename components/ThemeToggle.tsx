"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

/** Segmented control: light / system / dark. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const options = [
    { value: "light", label: t("theme.light"), Icon: Sun },
    { value: "system", label: t("theme.system"), Icon: Monitor },
    { value: "dark", label: t("theme.dark"), Icon: Moon },
  ] as const;

  return (
    <div role="radiogroup" aria-label={t("nav.toggleTheme")} className={cn("inline-flex rounded-lg border border-line p-0.5", className)}>
      {options.map(({ value, label, Icon }) => {
        const active = mounted && theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
              active ? "bg-accent-soft text-accent-fg" : "text-faint hover:text-fg",
            )}
          >
            <Icon size={14} strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
