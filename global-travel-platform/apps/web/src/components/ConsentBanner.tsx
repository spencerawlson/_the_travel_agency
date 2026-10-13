"use client";

import { Button } from "@gtp/ui";
import { useTranslations } from "next-intl";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Link } from "@/i18n/navigation";

/**
 * Opt-in consent for the optional partner script (Québec Law 25: consent must be
 * manifest, free and enlightened; refusing is as easy as accepting). Nothing
 * third-party runs before "Accept". Only rendered when a partner script is enabled.
 */
export const CONSENT_COOKIE = "fl_consent";
export const LOADER_ID = "partner-loader";
const CHANGE_EVENT = "fl-consent-change";
const OPEN_EVENT = "fl-consent-open";

type Consent = "accepted" | "refused" | null;

export function readConsent(cookie: string = document.cookie): Consent {
  const match = cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  const value = match?.slice(CONSENT_COOKIE.length + 1);
  return value === "partners-1" ? "accepted" : value === "partners-0" ? "refused" : null;
}

function writeConsent(accepted: boolean) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=partners-${accepted ? 1 : 0}; Path=/; Max-Age=${
    60 * 60 * 24 * 365
  }; SameSite=Lax${secure}`;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Turn the inert loader (type="text/plain") into a running script, once. */
export function activatePartnerScript(): boolean {
  const template = document.getElementById(LOADER_ID);
  if (!template || template.dataset.activated) return false;
  const script = document.createElement("script");
  script.text = template.textContent ?? "";
  document.head.appendChild(script);
  template.dataset.activated = "1";
  return true;
}

/** Re-open the banner (footer "Cookie settings"). */
export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function subscribe(cb: () => void) {
  window.addEventListener(CHANGE_EVENT, cb);
  return () => window.removeEventListener(CHANGE_EVENT, cb);
}

export function ConsentBanner() {
  const t = useTranslations("consent");
  // Server snapshot is "unknown" so nothing renders (and no mismatch) before hydration.
  const consent = useSyncExternalStore(
    subscribe,
    () => readConsent(),
    () => undefined,
  );
  const [reopened, setReopened] = useState(false);

  useEffect(() => {
    if (consent === "accepted") activatePartnerScript();
  }, [consent]);

  useEffect(() => {
    const open = () => setReopened(true);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);

  if (consent === undefined || (consent !== null && !reopened)) return null;

  function choose(accepted: boolean) {
    const wasRunning = Boolean(document.getElementById(LOADER_ID)?.dataset.activated);
    writeConsent(accepted);
    setReopened(false);
    // A loaded third-party script can't be unloaded; reload to honour a withdrawal.
    if (!accepted && wasRunning) window.location.reload();
  }

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-2xl rounded-3xl bg-surface-1 p-5 shadow-2xl ring-1 ring-line sm:inset-x-6 sm:bottom-6"
    >
      <h2 id="consent-title" className="font-display text-xl font-semibold">
        {t("title")}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">{t("body")}</p>
      <p className="mt-2 text-sm">
        <Link href="/legal/cookies" className="font-semibold text-brand-600 underline">
          {t("learnMore")}
        </Link>
      </p>
      {/* Equal prominence for both choices. */}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={() => choose(false)}>
          {t("reject")}
        </Button>
        <Button variant="secondary" onClick={() => choose(true)}>
          {t("accept")}
        </Button>
      </div>
    </section>
  );
}

export function CookieSettingsButton({ className }: { className?: string }) {
  const t = useTranslations("consent");
  return (
    <button type="button" onClick={openConsentSettings} className={className}>
      {t("settings")}
    </button>
  );
}
