"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell, FormError } from "@/components/AuthShell";
import { KosmyBoardButton, kosmyErrorMessage } from "@/components/KosmyBoard";
import { useI18n } from "@/lib/i18n/client";
import { translateApiError } from "@/lib/i18n";
import { safeNext } from "@/lib/safe-redirect";

export function LoginForm({ kosmyEnabled = false, allowRegistration = true }: { kosmyEnabled?: boolean; allowRegistration?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const kosmyError = params.get("kosmy_error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ? translateApiError(data.error, t) : t("auth.login.failed"));
        return;
      }
      router.replace(data.user?.mustChangePwd ? "/profile?mustChange=1" : next);
      router.refresh();
    } catch {
      setError(t("api.networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell title={t("auth.login.title")} subtitle={t("auth.login.subtitle")}>
      {kosmyError && (
        <div className="mb-4">
          <FormError message={kosmyErrorMessage(t, kosmyError)} />
        </div>
      )}

      {kosmyEnabled && (
        <>
          <KosmyBoardButton href={`/auth/kosmy-board/login?target_link_uri=${encodeURIComponent(next)}`} label={t("kosmy.button")} />
          <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-widest text-faint">
            <span className="h-px flex-1 bg-line" />
            {t("kosmy.or")}
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate={false}>
        <div>
          <label htmlFor="email" className="label">
            {t("auth.login.email")}
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            className="input h-10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.login.emailPlaceholder")}
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            {t("auth.login.password")}
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className="input h-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <FormError message={error} />}

        <button type="submit" disabled={loading} className="btn-primary h-10 w-full">
          {loading ? t("auth.login.submitting") : t("auth.login.submit")}
        </button>
      </form>

      {allowRegistration && (
        <p className="mt-5 text-center text-sm text-muted">
          {t("auth.login.noAccount")}{" "}
          <Link href="/register" className="font-medium text-accent-fg hover:underline">
            {t("auth.login.createLink")}
          </Link>
        </p>
      )}
    </AuthShell>
  );
}
