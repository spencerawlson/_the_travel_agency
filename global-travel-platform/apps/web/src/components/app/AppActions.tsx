"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { shareCurrentPage } from "@/lib/app-share";
import { isAppUserAgent } from "@/lib/app-shell";
import { saveLastSearch, saveTrip, tripFromForm } from "@/lib/saved-trips";
import type { SearchFormState } from "@/lib/search";
import { Link } from "@/i18n/navigation";

/**
 * App-only actions on the flight results page: save this search on the
 * device, and share it through the native share sheet. Rendered only inside
 * the native shell (UA token), so these stay genuinely app-only features.
 * The last valid search is also recorded for the offline fallback page.
 */
export function AppActions({ form, locale }: { form: SearchFormState; locale: string }) {
  const t = useTranslations("app");
  const [inApp, setInApp] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    setInApp(isAppUserAgent(navigator.userAgent));
  }, []);

  useEffect(() => {
    if (!inApp) return;
    const trip = tripFromForm(form);
    if (trip) void saveLastSearch(trip);
  }, [inApp, form]);

  if (!inApp) return null;

  async function onSave() {
    const trip = tripFromForm(form);
    if (!trip || saving) return;
    setSaving(true);
    const added = await saveTrip(trip);
    setSaved(true);
    void added;
    setSaving(false);
  }

  async function onShare() {
    const ok = await shareCurrentPage(new URL(window.location.href), "Farelune");
    setShared(ok);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {saved ? (
        <Link
          href="/saved-trips"
          locale={locale}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
        >
          {t("tripSaved")}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving}
          className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {t("saveTrip")}
        </button>
      )}
      <button
        type="button"
        onClick={() => void onShare()}
        className="rounded-full border border-line bg-surface-1 px-4 py-2 text-sm font-semibold"
      >
        {t("shareTrip")}
      </button>
      {shared && <span className="text-sm text-ink-muted">{t("shared")}</span>}
    </div>
  );
}
