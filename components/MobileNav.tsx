"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

type LinkItem = { href: string; label: string; key: string; icon: string };

export function MobileNav({
  open,
  onClose,
  user,
  links,
  active,
}: {
  open: boolean;
  onClose: () => void;
  user: { displayName: string; avatarUrl: string | null };
  links: LinkItem[];
  active?: string;
}) {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          />
          <motion.nav
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl border-t border-primary/10 bg-surface/80 p-4 pb-8 backdrop-blur-2xl md:hidden"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-primary/30"></div>

            <div className="mb-4 flex items-center gap-3 px-2">
              <Avatar name={user.displayName} url={user.avatarUrl} size={40} />
              <div>
                <p className="text-sm font-semibold text-on-surface">{user.displayName}</p>
                <p className="text-xs text-on-surface-variant">Mon compte</p>
              </div>
            </div>

            <ul className="space-y-1">
              {links.map((l) => (
                <li key={l.key}>
                  <Link
                    href={l.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-base font-medium transition-colors",
                      active === l.key
                        ? "border border-primary/20 bg-primary/10 text-primary"
                        : "text-on-surface-variant hover:bg-primary/5 hover:text-on-surface",
                    )}
                  >
                    <Icon name={l.icon} size={20} />
                    {l.label}
                  </Link>
                </li>
              ))}
              <li>
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-base font-medium text-on-surface-variant transition-colors hover:bg-error/10 hover:text-error"
                >
                  <Icon name="logout" size={20} />
                  Déconnexion
                </button>
              </li>
            </ul>
          </motion.nav>
        </>
      )}
    </AnimatePresence>
  );
}
