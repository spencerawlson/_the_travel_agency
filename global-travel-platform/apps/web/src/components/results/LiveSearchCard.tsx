"use client";

import type { LiveSearchLink } from "@gtp/shared-types";
import { useTranslations } from "next-intl";

/** Partner name without the "(via …)" network suffix. */
function brand(name: string): string {
  return name.replace(/\s*\(.*\)\s*$/, "") || name;
}

/**
 * "See live prices for your exact dates" on the partner's own search page.
 * Shown with every real search: cached fares are only a sample, the partner
 * page is authoritative. No price is shown here.
 */
export function LiveSearchCard({
  link,
  empty,
  busy,
  onSelect,
}: {
  link: LiveSearchLink;
  /** No cached fares: make this the main call to action. */
  empty: boolean;
  busy: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("results");
  const partner = brand(link.provider_name);
  return (
    <div
      className={`flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5 ${
        empty ? "border-brand-200 bg-brand-50" : "border-line bg-surface-1"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t(empty ? "liveTitleEmpty" : "liveTitle", { partner })}</p>
        <p className="mt-1 text-sm text-ink-muted">{t("liveBody", { partner })}</p>
      </div>
      {link.bookable ? (
        <button
          type="button"
          onClick={onSelect}
          disabled={busy}
          className="w-full shrink-0 rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
        >
          {busy ? t("redirecting") : t("liveCta", { partner })} ↗
        </button>
      ) : (
        <button
          type="button"
          disabled
          className="w-full shrink-0 cursor-not-allowed rounded-full bg-surface-2 px-5 py-2.5 text-sm font-semibold text-ink-muted sm:w-auto"
        >
          {t("bookingSoon")}
        </button>
      )}
    </div>
  );
}
