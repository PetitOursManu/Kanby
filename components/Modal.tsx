"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  children,
  size = "md",
  frosted = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  frosted?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const maxW = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-md";

  return (
    <AnimatePresence>
      {open && (
        /*
         * Centering is done with flexbox on the overlay (NOT with translate
         * classes on the panel), because framer-motion animates the panel's
         * `transform` inline — which would override Tailwind's -translate-x/y
         * and break centering.
         */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-md md:items-center md:p-4"
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => info.offset.y > 120 && onClose()}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "max-h-[88vh] w-full overflow-y-auto rounded-t-2xl md:rounded-2xl",
              frosted ? "glass-modal" : "glass-elevated",
              maxW,
            )}
          >
            {/* Drag handle (mobile only) */}
            <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-primary/30 md:hidden" />
            {title && (
              <div className="px-5 pt-4">
                <h2 className="text-lg font-semibold text-on-surface">{title}</h2>
              </div>
            )}
            <div className="p-5 pt-3">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
