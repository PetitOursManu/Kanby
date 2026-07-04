"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell, Field, ErrorShake } from "@/app/login/LoginForm";
import { useI18n } from "@/lib/i18n/client";

export function RegisterForm() {
  const { t } = useI18n();
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName, email, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || t("auth.register.failed"));
      return;
    }
    router.push("/boards");
    router.refresh();
  }

  return (
    <AuthShell title={t("auth.register.title")} subtitle={t("auth.register.subtitle")}>
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label={t("auth.register.displayName")}>
          <input
            required
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("auth.register.displayNamePlaceholder")}
          />
        </Field>
        <Field label={t("auth.register.email")}>
          <input
            type="email"
            autoComplete="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("auth.register.emailPlaceholder")}
          />
        </Field>
        <Field label={t("auth.register.password")}>
          <input
            type="password"
            autoComplete="new-password"
            required
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {error && <ErrorShake message={error} />}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? t("auth.register.submitting") : t("auth.register.submit")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-on-surface-variant">
        {t("auth.register.hasAccount")}{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          {t("auth.register.loginLink")}
        </Link>
      </p>
    </AuthShell>
  );
}