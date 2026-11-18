"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell, FormError } from "@/components/AuthShell";
import { useI18n } from "@/lib/i18n/client";
import { translateApiError } from "@/lib/i18n";

export function RegisterForm({ allowed = true }: { allowed?: boolean }) {
  const { t } = useI18n();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
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
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ? translateApiError(data.error, t) : t("auth.register.failed"));
        return;
      }
      router.replace("/boards");
      router.refresh();
    } catch {
      setError(t("api.networkError"));
    } finally {
      setLoading(false);
    }
  }

  if (!allowed) {
    return (
      <AuthShell title={t("auth.register.title")} subtitle={t("auth.register.closed")}>
        <p className="text-sm text-muted">{t("auth.register.closedHint")}</p>
        <Link href="/login" className="btn-primary mt-5 h-10 w-full">
          {t("auth.register.loginLink")}
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("auth.register.title")} subtitle={t("auth.register.subtitle")}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="displayName" className="label">
            {t("auth.register.displayName")}
          </label>
          <input
            id="displayName"
            required
            autoFocus
            maxLength={80}
            autoComplete="name"
            className="input h-10"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("auth.register.displayNamePlaceholder")}
          />
        </div>
        <div>
          <label htmlFor="email" className="label">
            {t("auth.register.email")}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            className="input h-10"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.register.emailPlaceholder")}
          />
        </div>
        <div>
          <label htmlFor="password" className="label">
            {t("auth.login.password")}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            className="input h-10"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="hint">
            {t("auth.register.passwordHint")}
          </p>
        </div>

        {error && <FormError message={error} />}

        <button type="submit" disabled={loading} className="btn-primary h-10 w-full">
          {loading ? t("auth.register.submitting") : t("auth.register.submit")}
        </button>
      </form>

      <p className="mt-5 text-center text-sm text-muted">
        {t("auth.register.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-accent-fg hover:underline">
          {t("auth.register.loginLink")}
        </Link>
      </p>
    </AuthShell>
  );
}
