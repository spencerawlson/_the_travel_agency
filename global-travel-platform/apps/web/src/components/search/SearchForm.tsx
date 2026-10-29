"use client";

import type { Airport } from "@gtp/shared-types";
import { Button } from "@gtp/ui";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { isAppUserAgent } from "@/lib/app-shell";
import { formatDate } from "@/lib/format";
import {
  type AirportChoice,
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
import { DateRangeCalendar } from "./DateRangeCalendar";
import { PassengerPicker } from "./PassengerPicker";

interface Props {
  initial?: SearchFormState;
  /** Pre-filled origin when no `initial` is given (e.g. the visitor's location). */
  defaultOrigin?: AirportChoice;
  compact?: boolean;
  /** Injectable for tests. */
  onSubmitValid?: (form: SearchFormState) => void;
  fetchAirports?: (q: string, signal: AbortSignal) => Promise<Airport[]>;
}

const fieldClass =
  "w-full rounded-xl border border-line bg-surface-1 px-3 py-3 text-base text-ink focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none aria-[invalid=true]:border-red-500";
const labelClass = "mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase";

function TrashIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}

interface SearchDatesProps {
  departDate: string;
  returnDate: string;
  roundTrip: boolean;
  today: string;
  locale: string;
  calendarOpen: boolean;
  onCalendarOpen: () => void;
  onCalendarClose: () => void;
  onDatesChange: (departDate: string, returnDate: string) => void;
  departError?: string;
  returnError?: string;
  /** App card layout adds a trash button that clears one date. */
  showTrash?: boolean;
}

/** Departure/return cards over the one shared calendar (both layouts). */
function SearchDates({
  departDate,
  returnDate,
  roundTrip,
  today,
  locale,
  calendarOpen,
  onCalendarOpen,
  onCalendarClose,
  onDatesChange,
  departError,
  returnError,
  showTrash = false,
}: SearchDatesProps) {
  const t = useTranslations("search");
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className={labelClass}>{t("depart")}</span>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={t("depart")}
              aria-expanded={calendarOpen}
              aria-invalid={Boolean(departError)}
              aria-describedby={departError ? "depart-error" : undefined}
              onClick={onCalendarOpen}
              className={`${fieldClass} flex-1 text-left aria-[invalid=true]:border-red-500`}
            >
              {departDate ? (
                formatDate(departDate, locale)
              ) : (
                <span className="text-ink-muted">{t("selectDate")}</span>
              )}
            </button>
            {showTrash && departDate && (
              <button
                type="button"
                aria-label={t("clearDepart")}
                onClick={() => onDatesChange("", roundTrip ? returnDate : "")}
                className="shrink-0 rounded-xl border border-line bg-surface-1 px-3 text-ink-muted"
              >
                <TrashIcon />
              </button>
            )}
          </div>
          {departError && (
            <p id="depart-error" className="mt-1 text-sm text-red-600">
              {departError}
            </p>
          )}
        </div>
        <div>
          <span className={labelClass}>{t("return")}</span>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label={t("return")}
              aria-expanded={calendarOpen}
              aria-invalid={Boolean(returnError)}
              aria-describedby={returnError ? "return-error" : undefined}
              disabled={!roundTrip}
              onClick={onCalendarOpen}
              className={`${fieldClass} flex-1 text-left disabled:opacity-50 aria-[invalid=true]:border-red-500`}
            >
              {roundTrip && returnDate ? (
                formatDate(returnDate, locale)
              ) : (
                <span className="text-ink-muted">{t("selectDate")}</span>
              )}
            </button>
            {showTrash && roundTrip && returnDate && (
              <button
                type="button"
                aria-label={t("clearReturn")}
                onClick={() => onDatesChange(departDate, "")}
                className="shrink-0 rounded-xl border border-line bg-surface-1 px-3 text-ink-muted"
              >
                <TrashIcon />
              </button>
            )}
          </div>
          {returnError && (
            <p id="return-error" className="mt-1 text-sm text-red-600">
              {returnError}
            </p>
          )}
        </div>
      </div>
      {calendarOpen && (
        <DateRangeCalendar
          departDate={departDate}
          returnDate={roundTrip ? returnDate : ""}
          roundTrip={roundTrip}
          today={today}
          maxDate={addDays(today, MAX_DAYS_AHEAD)}
          locale={locale}
          onChange={onDatesChange}
          onDone={onCalendarClose}
        />
      )}
    </div>
  );
}

/** Persist the visitor's chosen origin (read server-side by getOrigin()). */
function rememberOrigin(iata: string) {
  if (typeof document === "undefined" || !/^[A-Za-z]{3}$/.test(iata)) return;
  document.cookie = `gtp_origin=${iata.toUpperCase()}; path=/; max-age=${365 * 24 * 3600}; samesite=lax`;
}

export function SearchForm({
  initial,
  defaultOrigin,
  compact = false,
  onSubmitValid,
  fetchAirports,
}: Props) {
  const t = useTranslations("search");
  const locale = useLocale();
  const router = useRouter();
  // Server-provided origin (visitor location) keeps server and client renders identical.
  const [form, setForm] = useState<SearchFormState>(
    () => initial ?? { ...defaultForm(), origin: defaultOrigin ?? null },
  );
  const [errors, setErrors] = useState<SearchErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // App-only card layout, same mounted-flag pattern as the results view.
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setInApp(isAppUserAgent(navigator.userAgent));
  }, []);
  const today = todayIso();

  function update<K extends keyof SearchFormState>(key: K, value: SearchFormState[K]) {
    const next = { ...form, [key]: value };
    setForm(next);
    // Remember a manually chosen origin so destination distances follow it.
    if (key === "origin" && value) rememberOrigin((value as AirportChoice).iata);
    if (submitted) setErrors(validateSearch(next, today));
  }

  /** One shared-calendar pick updates both dates in a single state change. */
  function updateDates(departDate: string, returnDate: string) {
    const next = { ...form, departDate, returnDate };
    setForm(next);
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
  const swap = () => setForm({ ...form, origin: form.destination, destination: form.origin });

  const dates = (
    <SearchDates
      departDate={form.departDate}
      returnDate={form.returnDate}
      roundTrip={roundTrip}
      today={today}
      locale={locale}
      calendarOpen={calendarOpen}
      onCalendarOpen={() => setCalendarOpen(true)}
      onCalendarClose={() => setCalendarOpen(false)}
      onDatesChange={updateDates}
      departError={err("departDate")}
      returnError={err("returnDate")}
      showTrash={inApp}
    />
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-label={t("formLabel")}
      className={compact ? "space-y-3" : "space-y-4"}
    >
      {inApp ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <select
              aria-label={t("tripType")}
              value={form.tripType}
              onChange={(e) => update("tripType", e.target.value as SearchFormState["tripType"])}
              className={fieldClass}
            >
              <option value="round_trip">{t("roundTrip")}</option>
              <option value="one_way">{t("oneWay")}</option>
            </select>
            <select
              aria-label={t("cabin")}
              value={form.cabin}
              onChange={(e) => update("cabin", e.target.value as SearchFormState["cabin"])}
              className={fieldClass}
            >
              {CABINS.map((c) => (
                <option key={c} value={c}>
                  {t(`cabins.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PassengerPicker
              adults={form.adults}
              childCount={form.children}
              infants={form.infants}
              onChange={(field, value) => update(field, value)}
              error={err("passengers")}
            />
            <select
              aria-label={t("currency")}
              value={form.currency}
              onChange={(e) => update("currency", e.target.value)}
              className={fieldClass}
              aria-invalid={Boolean(errors.currency)}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <AirportCombobox
            label={t("from")}
            value={form.origin}
            onChange={(v) => update("origin", v)}
            error={err("origin")}
            fetchAirports={fetchAirports}
            chipClassName="bg-brand-600 text-white"
            clearLabel={t("clearOrigin")}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={swap}
              aria-label={t("swap")}
              className="rounded-full border border-line bg-surface-1 p-2.5 text-lg leading-none hover:bg-surface-2"
            >
              <span aria-hidden>⇄</span>
            </button>
          </div>
          <AirportCombobox
            label={t("to")}
            value={form.destination}
            onChange={(v) => update("destination", v)}
            error={err("destination")}
            fetchAirports={fetchAirports}
            chipClassName="bg-accent-600 text-white"
            clearLabel={t("clearDestination")}
          />
          {dates}
          <Button type="submit" className="h-[52px] w-full text-base">
            {t("submit")}
          </Button>
        </div>
      ) : (
        <>
          <fieldset className="flex flex-wrap items-center gap-4">
            <legend className="sr-only">{t("tripType")}</legend>
            {(["round_trip", "one_way"] as const).map((type) => (
              <label
                key={type}
                className="flex cursor-pointer items-center gap-2 text-sm font-medium"
              >
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
              onClick={swap}
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
            <div className="sm:col-span-2">{dates}</div>
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
        </>
      )}
    </form>
  );
}
