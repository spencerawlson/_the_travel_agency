"use client";

import type { AdminSession } from "@gtp/shared-types";
import { Button, Card } from "@gtp/ui";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError, apiFetch } from "@/lib/api";

export function LoginForm() {
  const t = useTranslations("admin");
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    params.get("expired") ? t("sessionExpired") : null,
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch<AdminSession>("/api/v1/admin/auth/login", {
        method: "POST",
        body: { email, password },
      });
      setPassword("");
      router.replace("/admin");
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? t("rateLimited") : t("invalid"));
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 w-full rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-base focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none";

  return (
    <Card className="mx-auto w-full max-w-sm">
      <h1 className="font-display text-2xl font-semibold">{t("loginTitle")}</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">
          {t("email")}
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm font-medium">
          {t("password")}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t("signingIn") : t("signIn")}
        </Button>
      </form>
    </Card>
  );
}
