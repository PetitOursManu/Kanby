"use client";

import { AlertCircle } from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageSwitch } from "@/components/LanguageSwitch";

/** Centered layout for the sign-in / sign-up pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-[380px] animate-fade-in">
          <div className="mb-7 flex flex-col items-center text-center">
            <LogoMark size={44} />
            <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-fg">{title}</h1>
            <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          </div>
          <div className="panel p-6 shadow-card">{children}</div>
        </div>
      </main>
      <footer className="flex items-center justify-center gap-3 pb-6">
        <LanguageSwitch />
        <ThemeToggle />
      </footer>
    </div>
  );
}

export function FormError({ message }: { message: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      {message}
    </p>
  );
}
