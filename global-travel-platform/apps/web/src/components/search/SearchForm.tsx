"use client";

import type { Airport } from "@gtp/shared-types";
import { Button } from "@gtp/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { IATA_ORIGIN } from "@/content/origin-airports";
import {
  addDays,
  CABINS,
  CURRENCIES,
  defaultForm,
  MAX_DAYS_AHEAD,
  type SearchErrors,
  type SearchFormState,
  todayIso,
  toQuery,
  validateSearch,
} from "@/lib/search";
import { AirportCombobox } from "./AirportCombobox";
import { PassengerPicker } from "./PassengerPicker";

interface Props {
  initial?: SearchFormState;
  compact?: boolean;
  /** Injectable for tests. */
  onSubmitValid?: (form: SearchFormState) => void;
  fetchAirports?: (q: string, signal: AbortSignal) => Promise<Airport[]>;
}

const fieldClass =
  "w-full rounded-xl border border-line bg-surface-1 px-3 py-3 text-base text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none aria-[invalid=true]:border-red-500";
const labelClass = "mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase";

export function SearchForm({ initial, compact = false, onSubmitValid, fetchAirports }: Props) {
  const t = useTranslations("search");
  const locale = useLocale();
  const router = useRouter();
  const [form, setForm] = useState<SearchFormState>(() => {
    const base = initial ?? defaultForm();
    // Prefill the origin from the visitor's detected location (cookie set by
    // the middleware), unless an explicit initial value was given.
    if (!initial && !base.origin && typeof document !== "undefined") {
      const m = document.cookie.match(/(?:^|;\s*)gtp_origin=([A-Za-z]{3})/);
      const o = m?.[1] ? IATA_ORIGIN[m[1].toUpperCase()] : undefined;
      if (o) base.origin = { iata: o.iata, label: `${locale === "fr" ? o.cityFr : o.city} (${o.iata})` };
    }
    return base;
  });
  const [errors, setErrors] = useState<SearchErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const today = todayIso();

  function update<K extends keyof SearchFormState>(key: K, value: SearchFormState[K]) {
    const next = { ...form, [key]: value };
    setForm(next);
    // Remember a manually chosen origin so destination distances follow it.
    if (key === "origin" && value && typeof document !== "undefined") {
      const iata = (value as { iata?: string }).iata;
      if (iata && /^[A-Za-z]{3}$/.test(iata)) {
        document.cookie = `gtp_origin=${iata.toUpperCase()}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
      }
    }
    if (submitted) setErrors(validateSearch(next, today));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const found = validateSearch(form, today);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (onSubmitValid) onSubmitValid(form);
    else router.push({ pathname: "/flights", query: toQuery(form) });
  }

  const err = (key: keyof SearchErrors) => (errors[key] ? t(`errors.${errors[key]}`) : undefined);
  const roundTrip = form.tripType === "round_trip";

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t("formLabel")}
      className={compact ? "space-y-3" : "space-y-4"}
    >
      <fieldset className="flex flex-wrap items-center gap-4">
        <legend className="sr-only">{t("tripType")}</legend>
        {(["round_trip", "one_way"] as const).map((type) => (
          <label key={type} className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="radio"
              name="tripType"
              value={type}
              checked={form.tripType === type}
              onChange={() => update("tripType", type)}
              className="size-4 accent-brand-600"
            />
            {type === "round_trip" ? t("roundTrip") : t("oneWay")}
          </label>
        ))}
        <label className="ml-auto flex items-center gap-2 text-sm">
          <span className="font-medium">{t("cabin")}</span>
          <select
            value={form.cabin}
            onChange={(e) => update("cabin", e.target.value as SearchFormState["cabin"])}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5"
          >
            {CABINS.map((c) => (
              <option key={c} value={c}>
                {t(`cabins.${c}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium">{t("currency")}</span>
          <select
            value={form.currency}
            onChange={(e) => update("currency", e.target.value)}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5"
            aria-invalid={Boolean(errors.currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </fieldset>

      <div className={compact ? "grid gap-3" : "grid gap-3 md:grid-cols-[1fr_auto_1fr]"}>
        <AirportCombobox
          label={t("from")}
          value={form.origin}
          onChange={(v) => update("origin", v)}
          error={err("origin")}
          fetchAirports={fetchAirports}
        />
        <button
          type="button"
          onClick={() => setForm({ ...form, origin: form.destination, destination: form.origin })}
          aria-label={t("swap")}
          className="self-end justify-self-center rounded-full border border-line bg-surface-1 p-3 text-lg leading-none hover:bg-surface-2 md:mb-1"
        >
          <span aria-hidden>⇄</span>
        </button>
        <AirportCombobox
          label={t("to")}
          value={form.destination}
          onChange={(v) => update("destination", v)}
          error={err("destination")}
          fetchAirports={fetchAirports}
        />
      </div>

      <div
        className={
          compact
            ? "grid gap-3 sm:grid-cols-2"
            : "grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"
        }
      >
        <div>
          <label htmlFor="depart-date" className={labelClass}>
            {t("depart")}
          </label>
          <input
            id="depart-date"
            type="date"
            min={today}
            max={addDays(today, MAX_DAYS_AHEAD)}
            value={form.departDate}
            onChange={(e) => update("departDate", e.target.value)}
            aria-invalid={Boolean(errors.departDate)}
            aria-describedby={errors.departDate ? "depart-error" : undefined}
            className={fieldClass}
          />
          {errors.departDate && (
            <p id="depart-error" className="mt-1 text-sm text-red-600">
              {err("departDate")}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="return-date" className={labelClass}>
            {t("return")}
          </label>
          <input
            id="return-date"
            type="date"
            disabled={!roundTrip}
            min={form.departDate || today}
            max={addDays(today, MAX_DAYS_AHEAD)}
            value={roundTrip ? form.returnDate : ""}
            onChange={(e) => update("returnDate", e.target.value)}
            aria-invalid={Boolean(errors.returnDate)}
            aria-describedby={errors.returnDate ? "return-error" : undefined}
            className={`${fieldClass} disabled:opacity-50`}
          />
          {errors.returnDate && (
            <p id="return-error" className="mt-1 text-sm text-red-600">
              {err("returnDate")}
            </p>
          )}
        </div>
        <PassengerPicker
          adults={form.adults}
          childCount={form.children}
          infants={form.infants}
          onChange={(field, value) => update(field, value)}
          error={err("passengers")}
        />
        <Button
          type="submit"
          className={`h-[52px] self-end px-6 text-base ${compact ? "" : "sm:col-span-2 lg:col-span-1"}`}
        >
          {t("submit")}
        </Button>
      </div>
    </form>
  );
}
