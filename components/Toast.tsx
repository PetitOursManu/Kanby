"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/client";
import { translateApiError } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type Toast = { id: number; kind: "error" | "success"; text: string };
type ToastApi = { error: (e: unknown) => void; success: (text: string) => void };

const ToastContext = createContext<ToastApi>({ error: () => {}, success: () => {} });

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((arr) => [...arr.slice(-2), { id, kind, text }]);
    setTimeout(() => setToasts((arr) => arr.filter((x) => x.id !== id)), kind === "error" ? 6000 : 3000);
  }, []);

  const value = useMemo<ToastApi>(
    () => ({
      error: (e) => {
        const raw = e instanceof Error ? e.message : typeof e === "string" ? e : t("misc.error");
        push("error", translateApiError(raw, t));
      },
      success: (text) => push("success", text),
    }),
    [push, t],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              role={toast.kind === "error" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex max-w-md items-start gap-2.5 rounded-xl border bg-surface px-3.5 py-2.5 text-sm shadow-pop",
                toast.kind === "error" ? "border-danger/30" : "border-line",
              )}
            >
              {toast.kind === "error" ? (
                <AlertCircle size={17} className="mt-px shrink-0 text-danger" />
              ) : (
                <CheckCircle2 size={17} className="mt-px shrink-0 text-accent" />
              )}
              <span className="text-fg">{toast.text}</span>
              <button
                type="button"
                onClick={() => setToasts((arr) => arr.filter((x) => x.id !== toast.id))}
                className="-mr-1 ml-1 text-faint hover:text-fg"
                aria-label={t("common.close")}
              >
                <X size={15} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
