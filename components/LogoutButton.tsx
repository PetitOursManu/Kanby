"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/** Returns a function that ends the session and goes back to /login. */
export function useLogout() {
  const router = useRouter();
  return useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }, [router]);
}
