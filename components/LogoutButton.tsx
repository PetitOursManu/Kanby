"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";

export function LogoutButton({
  className,
  showLabel,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      aria-label="Déconnexion"
      title="Déconnexion"
      className={cn(
        "transition-colors",
        showLabel
          ? "inline-flex w-full items-center justify-start gap-3"
          : "inline-flex h-9 w-9 items-center justify-center rounded-full border border-primary/20 text-on-surface-variant hover:bg-primary/5 hover:text-primary",
        className,
      )}
    >
      <Icon name="logout" size={18} />
      {showLabel && <span>Déconnexion</span>}
    </button>
  );
}
