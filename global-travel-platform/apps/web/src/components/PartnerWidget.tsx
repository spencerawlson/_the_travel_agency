"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { openConsentSettings, useConsent } from "@/components/ConsentBanner";

/**
 * Kiwi.com's widget parses "YYYY-MM-DD" as UTC midnight, so west of UTC it
 * shows the day before. A midday time keeps the calendar date everywhere.
 * The Travelpayouts loader only accepts plain dates, so patch the attribute on
 * the Kiwi script it inserts, before that script runs.
 */
function fixKiwiDates(root: HTMLElement): MutationObserver {
  const patch = (el: Element) => {
    for (const attr of ["data-departure", "data-return"]) {
      const v = el.getAttribute(attr);
      if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) el.setAttribute(attr, `${v}T12:00`);
    }
  };
  const mo = new MutationObserver((records) => {
    for (const r of records)
      r.addedNodes.forEach((n) => {
        if (n instanceof Element) {
          if (n.tagName === "SCRIPT") patch(n);
          n.querySelectorAll("script[data-departure],script[data-return]").forEach(patch);
        }
      });
  });
  mo.observe(root, { childList: true, subtree: true });
  return mo;
}

/**
 * A Travelpayouts brand widget (Klook, Kiwi.com). Loads its script only after
 * the visitor accepts partner cookies; until then, a short note with a button
 * to open the cookie settings. `src` comes from lib/widgets.ts (server-built).
 */
export function PartnerWidget({
  src,
  title,
  partner,
  minHeight = 280,
}: {
  src: string;
  title: string;
  partner: string;
  minHeight?: number;
}) {
  const t = useTranslations("widgets");
  const consent = useConsent();
  const ref = useRef<HTMLDivElement>(null);
  const accepted = consent === "accepted";

  useEffect(() => {
    const root = ref.current;
    if (!accepted || !root) return;
    const mo = fixKiwiDates(root);
    const script = document.createElement("script");
    script.async = true;
    script.charset = "utf-8";
    script.src = src;
    root.appendChild(script);
    return () => {
      mo.disconnect();
      root.replaceChildren();
    };
  }, [accepted, src]);

  return (
    <section aria-label={title} className="rounded-3xl border border-line bg-surface-1 p-4 sm:p-6">
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      {accepted ? (
        <div ref={ref} className="mt-4" style={{ minHeight }} />
      ) : consent === undefined ? (
        <div className="mt-4" style={{ minHeight }} />
      ) : (
        <div className="mt-4 rounded-2xl bg-surface-2 p-5 text-sm">
          <p className="text-ink-muted">{t("needsConsent", { partner })}</p>
          <button
            type="button"
            onClick={openConsentSettings}
            className="mt-3 rounded-full bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700"
          >
            {t("allow")}
          </button>
        </div>
      )}
    </section>
  );
}
