"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

type LinkItem = { href: string; label: string; key: string };

export function MobileNav({
  links,
  active,
}: {
  links: LinkItem[];
  active?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      {/* Floating menu button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ouvrir le menu"
        className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-brand-600 text-white shadow-lift active:scale-95 transition-transform"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/40"
            />
            <motion.nav
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", stiffness: 320, damping: 32 }}
              className="surface fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t p-4 pb-6"
            >
              <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-300 dark:bg-slate-600" />
              <ul className="space-y-1">
                {links.map((l) => (
                  <li key={l.key}>
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "block rounded-xl px-4 py-3 text-base font-medium",
                        active === l.key
                          ? "bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                          : "hover:bg-slate-100 dark:hover:bg-slate-800",
                      )}
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <LogoutButton />
                </li>
              </ul>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="block w-full rounded-xl px-4 py-3 text-left text-base font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
    >
      Déconnexion
    </button>
  );
}