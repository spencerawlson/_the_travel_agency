"use client";

import type {
  FlightOffer,
  FlightSearchResponse,
  Locale,
  ReferralClickResponse,
} from "@gtp/shared-types";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SearchForm } from "@/components/search/SearchForm";
import { useRouter } from "@/i18n/navigation";
import { ApiError, apiFetch } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { fromQuery, toApiRequest, validateSearch } from "@/lib/search";
import { useRequest } from "@/lib/useRequest";
import { Disclaimers } from "./Disclaimers";
import { OfferCard } from "./OfferCard";

type Sort = "price" | "duration" | "departure";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; code: string }
  | { kind: "done"; data: FlightSearchResponse };

const KNOWN_ERRORS = new Set([
  "provider_unavailable",
  "rate_limited",
  "unknown_airport",
  "invalid_date",
  "unsupported_currency",
  "validation_error",
  "offer_expired",
  "referrals_disabled",
  "redirect_rejected",
]);

function errorKey(code: string): string {
  return KNOWN_ERRORS.has(code) ? `errors.${code}` : "errors.generic";
}

export function ResultsView() {
  const t = useTranslations("results");
  const search = useTranslations("search");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const params = useSearchParams();
  const queryKey = params.toString();
  const form = useMemo(() => fromQuery(new URLSearchParams(queryKey)), [queryKey]);
  const valid = Object.keys(validateSearch(form)).length === 0;

  const [sort, setSort] = useState<Sort>("price");
  const [busyOffer, setBusyOffer] = useState<string | null>(null);
  // Scoped to the search that produced it, so a new search clears it implicitly.
  const [clickError, setClickError] = useState<{ key: string; code: string } | null>(null);

  const requestKey = valid ? `${locale}|${queryKey}` : null;
  const request = useRequest<FlightSearchResponse>(requestKey, (signal) =>
    apiFetch<FlightSearchResponse>("/api/v1/flights/search", {
      method: "POST",
      body: toApiRequest(form, locale),
      signal,
    }),
  );
  const state: State =
    request.status === "success"
      ? { kind: "done", data: request.data }
      : request.status === "error"
        ? { kind: "error", code: request.error.code }
        : { kind: request.status === "loading" ? "loading" : "idle" };
  const visibleClickError = clickError && clickError.key === requestKey ? clickError.code : null;

  const data = request.status === "success" ? request.data : null;
  const offers = useMemo(() => {
    if (!data) return [];
    const list = [...data.offers];
    const departure = (o: FlightOffer) => o.outbound.segments[0]?.depart_at ?? "";
    if (sort === "price") list.sort((a, b) => Number(a.price.amount) - Number(b.price.amount));
    if (sort === "duration")
      list.sort((a, b) => a.outbound.duration_minutes - b.outbound.duration_minutes);
    if (sort === "departure") list.sort((a, b) => departure(a).localeCompare(departure(b)));
    return list;
  }, [data, sort]);

  async function selectOffer(offer: FlightOffer) {
    setBusyOffer(offer.id);
    setClickError(null);
    try {
      const res = await apiFetch<ReferralClickResponse>("/api/v1/referrals/click", {
        method: "POST",
        body: { offer_id: offer.id, locale },
      });
      if (res.redirect_url.startsWith("/")) {
        // Internal demo page (locale-prefixed by the router).
        const url = new URL(res.redirect_url, window.location.origin);
        router.push({ pathname: url.pathname, query: Object.fromEntries(url.searchParams) });
      } else {
        // Partner URL, validated server-side against the provider allowlist.
        window.location.assign(res.redirect_url);
      }
    } catch (err) {
      setClickError({
        key: requestKey ?? "",
        code: err instanceof ApiError ? err.code : "generic",
      });
      setBusyOffer(null);
    }
  }

  if (!valid) {
    return (
      <div className="space-y-6">
        <p className="text-ink-muted">{t("missingParams")}</p>
        <SearchForm initial={form} />
      </div>
    );
  }

  const failedProviders =
    state.kind === "done" ? state.data.providers.filter((p) => p.status === "error") : [];
  const pax = form.adults + form.children + form.infants;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-3xl font-semibold">
          {t("title", {
            origin: form.origin?.label ?? "",
            destination: form.destination?.label ?? "",
          })}
        </h1>
        <p className="text-ink-muted">
          {t("summary", {
            date:
              formatDate(form.departDate, locale) +
              (form.tripType === "round_trip" ? ` – ${formatDate(form.returnDate, locale)}` : ""),
            passengers: search("passengerSummary", { count: pax }),
            cabin: search(`cabins.${form.cabin}`),
          })}
        </p>
      </header>

      <details className="rounded-2xl border border-line bg-surface-1 p-4">
        <summary className="cursor-pointer font-semibold">{t("editSearch")}</summary>
        <div className="mt-4">
          <SearchForm key={queryKey} initial={form} compact />
        </div>
      </details>

      {state.kind === "done" && <Disclaimers codes={state.data.disclaimers} />}

      <div aria-live="polite" aria-busy={state.kind === "loading"}>
        {state.kind === "loading" && (
          <div className="space-y-3">
            <p className="text-ink-muted">{t("loading")}</p>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-surface-2" />
            ))}
          </div>
        )}
        {state.kind === "error" && (
          <p
            role="alert"
            className="rounded-xl border border-red-300 bg-red-50 p-4 text-red-900 dark:border-red-400/40 dark:bg-red-400/10 dark:text-red-200"
          >
            {t(errorKey(state.code))}
          </p>
        )}
        {state.kind === "done" && (
          <div className="space-y-4">
            {failedProviders.length > 0 && (
              <p role="status" className="text-sm text-amber-800 dark:text-amber-300">
                {t("providerIssue", { providers: failedProviders.map((p) => p.name).join(", ") })}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold">{t("count", { count: offers.length })}</p>
              <label className="flex items-center gap-2 text-sm">
                {t("sortBy")}
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="rounded-lg border border-line bg-surface-1 px-2 py-1.5"
                >
                  <option value="price">{t("sortPrice")}</option>
                  <option value="duration">{t("sortDuration")}</option>
                  <option value="departure">{t("sortDeparture")}</option>
                </select>
              </label>
            </div>
            {visibleClickError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {t(errorKey(visibleClickError))}
              </p>
            )}
            {offers.length === 0 ? (
              <p className="text-ink-muted">{t("empty")}</p>
            ) : (
              <ul className="space-y-3">
                {offers.map((offer) => (
                  <li key={offer.id}>
                    <OfferCard offer={offer} onSelect={selectOffer} busy={busyOffer === offer.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
