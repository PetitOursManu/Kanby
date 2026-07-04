"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={t("nav.toggleTheme")}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 text-on-surface-variant transition-colors hover:bg-primary/5 hover:text-primary",
        className,
      )}
    >
      {mounted ? (
        <motion.span
          key={isDark ? "moon" : "sun"}
          initial={{ rotate: -90, opacity: 0, scale: 0.6 }}
          animate={{ rotate: 0, opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="inline-flex"
        >
          <Icon name={isDark ? "sun" : "moon"} size={18} />
        </motion.span>
      ) : (
        <span className="h-[18px] w-[18px]" />
      )}
    </button>
  );
}
