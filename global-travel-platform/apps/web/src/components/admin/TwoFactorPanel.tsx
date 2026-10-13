"use client";

import type { AdminSession, TwoFactorSetup } from "@gtp/shared-types";
import { Button, Card } from "@gtp/ui";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { ApiError, apiFetch } from "@/lib/api";

type Step =
  | { kind: "idle" }
  | { kind: "scan"; setup: TwoFactorSetup }
  | { kind: "codes"; codes: string[] }
  | { kind: "disable" };

const inputClass =
  "mt-1 w-full rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-base focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none";

/**
 * Turn two-step sign-in on (scan QR, confirm a code, save recovery codes) or
 * off (password + code). Recovery codes are shown exactly once.
 */
export function TwoFactorPanel({
  session,
  onChanged,
}: {
  session: AdminSession;
  onChanged: () => void;
}) {
  const t = useTranslations("admin.twoFactor");
  const [step, setStep] = useState<Step>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const enabled = session.user.two_factor_enabled;

  function fail(err: unknown) {
    const c = err instanceof ApiError ? err.code : "";
    setError(
      c === "invalid_otp" ? t("invalidCode") : c === "rate_limited" ? t("rateLimited") : t("error"),
    );
    setBusy(false);
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const setup = await apiFetch<TwoFactorSetup>("/api/v1/admin/auth/2fa/setup", {
        method: "POST",
      });
      setStep({ kind: "scan", setup });
      setBusy(false);
    } catch (err) {
      fail(err);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ recovery_codes: string[] }>("/api/v1/admin/auth/2fa/enable", {
        method: "POST",
        body: { code },
      });
      setCode("");
      setStep({ kind: "codes", codes: res.recovery_codes });
      setBusy(false);
    } catch (err) {
      fail(err);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch("/api/v1/admin/auth/2fa/disable", {
        method: "POST",
        body: { password, code },
      });
      setPassword("");
      setCode("");
      setStep({ kind: "idle" });
      setBusy(false);
      onChanged();
    } catch (err) {
      fail(err);
    }
  }

  function downloadCodes(codes: string[]) {
    const blob = new Blob(
      [`Farelune admin recovery codes (${session.user.email})\n\n${codes.join("\n")}\n`],
      { type: "text/plain" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "farelune-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <Card className="max-w-2xl">
      <h2 className="font-display text-2xl font-semibold">{t("title")}</h2>
      <p className="mt-2 text-sm text-ink-muted">{t("intro")}</p>
      <p className="mt-4 text-sm font-semibold">
        {enabled ? (
          <span className="text-emerald-700">✓ {t("statusOn")}</span>
        ) : (
          <span className="text-amber-800">{t("statusOff")}</span>
        )}
      </p>

      {step.kind === "idle" && !enabled && (
        <Button className="mt-4" onClick={start} disabled={busy}>
          {t("turnOn")}
        </Button>
      )}
      {step.kind === "idle" && enabled && (
        <Button variant="secondary" className="mt-4" onClick={() => setStep({ kind: "disable" })}>
          {t("turnOff")}
        </Button>
      )}

      {step.kind === "scan" && (
        <form onSubmit={confirm} className="mt-4 space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            <li>{t("step1")}</li>
            <li>{t("step2")}</li>
            <li>{t("step3")}</li>
          </ol>
          <div className="flex flex-wrap items-start gap-5">
            {/* eslint-disable-next-line @next/next/no-img-element -- server-generated SVG data URI */}
            <img
              src={step.setup.qr_svg}
              alt={t("qrAlt")}
              width={200}
              height={200}
              className="rounded-xl bg-white p-2 ring-1 ring-line"
            />
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-ink-muted">{t("manual")}</p>
              <code className="mt-1 block rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm break-all">
                {step.setup.secret.replace(/(.{4})/g, "$1 ").trim()}
              </code>
            </div>
          </div>
          <label className="block max-w-xs text-sm font-medium">
            {t("codeLabel")}
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} tracking-widest`}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {t("confirm")}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setStep({ kind: "idle" })}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {step.kind === "codes" && (
        <div className="mt-4 space-y-4">
          <p role="status" className="text-sm font-semibold text-emerald-700">
            ✓ {t("enabledNow")}
          </p>
          <p className="text-sm">{t("codesIntro")}</p>
          <ul className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-4 font-mono text-sm sm:grid-cols-5">
            {step.codes.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => downloadCodes(step.codes)}>
              {t("download")}
            </Button>
            <Button
              type="button"
              onClick={() => {
                setStep({ kind: "idle" });
                onChanged();
              }}
            >
              {t("savedThem")}
            </Button>
          </div>
        </div>
      )}

      {step.kind === "disable" && (
        <form onSubmit={disable} className="mt-4 max-w-xs space-y-4">
          <p className="text-sm">{t("disableIntro")}</p>
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
          <label className="block text-sm font-medium">
            {t("codeOrRecovery")}
            <input
              type="text"
              autoComplete="one-time-code"
              required
              maxLength={16}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} tracking-widest`}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" disabled={busy}>
              {t("turnOff")}
            </Button>
            <Button type="button" onClick={() => setStep({ kind: "idle" })}>
              {t("cancel")}
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </Card>
  );
}
