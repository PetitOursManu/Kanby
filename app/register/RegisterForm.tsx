"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthShell, Field, ErrorShake } from "@/app/login/LoginForm";

export function RegisterForm() {
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
      setError(data.error || "Inscription échouée");
      return;
    }
    router.push("/boards");
    router.refresh();
  }

  return (
    <AuthShell title="Créer un compte" subtitle="Une minute suffit pour commencer.">
      <ThemeToggle className="absolute right-4 top-4" />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nom affiché">
          <input
            required
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Votre nom"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="vous@exemple.com"
          />
        </Field>
        <Field label="Mot de passe (8 caractères min.)">
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
          {loading ? "Création…" : "Créer le compte"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Déjà un compte ?{" "}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Se connecter
        </Link>
      </p>
    </AuthShell>
  );
}