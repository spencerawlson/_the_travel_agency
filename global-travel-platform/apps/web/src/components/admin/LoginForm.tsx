"use client";

import type { AdminSession } from "@gtp/shared-types";
import { Button, Card } from "@gtp/ui";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError, apiFetch } from "@/lib/api";

export function LoginForm() {
  const t = useTranslations("admin");
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // Second step: shown once the server says the password was right but a code is needed.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
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
        body: needsCode ? { email, password, otp: code } : { email, password },
      });
      setPassword("");
      setCode("");
      router.replace("/admin");
    } catch (err) {
      const apiErr = err instanceof ApiError ? err : null;
      if (apiErr?.code === "otp_required") {
        setNeedsCode(true);
        requestAnimationFrame(() => codeRef.current?.focus());
      } else if (apiErr?.code === "invalid_otp") {
        setCode("");
        setError(t("invalidCode"));
      } else if (apiErr?.status === 429) {
        setError(t("rateLimited"));
      } else {
        // Wrong password (or locked): start over from the first step.
        setNeedsCode(false);
        setCode("");
        setError(t("invalid"));
      }
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
            readOnly={needsCode}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className={needsCode ? "sr-only" : "block text-sm font-medium"}>
          {t("password")}
          <input
            type="password"
            autoComplete="current-password"
            required
            readOnly={needsCode}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        {needsCode && (
          <div>
            <label className="block text-sm font-medium">
              {t("codeLabel")}
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={16}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`${inputClass} tracking-widest`}
              />
            </label>
            <p className="mt-1 text-xs text-ink-muted">{t("codeHint")}</p>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t("signingIn") : needsCode ? t("verify") : t("signIn")}
        </Button>
        {needsCode && (
          <button
            type="button"
            onClick={() => {
              setNeedsCode(false);
              setCode("");
              setPassword("");
              setError(null);
            }}
            className="w-full text-sm text-ink-muted underline"
          >
            {t("startOver")}
          </button>
        )}
      </form>
    </Card>
  );
}
