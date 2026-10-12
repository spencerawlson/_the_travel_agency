"use client";

import type { DealsResponse } from "@gtp/shared-types";
import { Badge, Card } from "@gtp/ui";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/format";
import { CURRENCIES } from "@/lib/search";
import { useRequest } from "@/lib/useRequest";
import { Disclaimers } from "./results/Disclaimers";

const ORIGINS = ["YUL", "YQB", "YYZ", "YVR", "JFK", "LHR", "CDG"];

export function DealsView() {
  const t = useTranslations("deals");
  const results = useTranslations("results");
  const demo = useTranslations("demo");
  const locale = useLocale();
  const [origin, setOrigin] = useState("YUL");
  const [currency, setCurrency] = useState("CAD");
  const path = `/api/v1/deals?origin=${origin}&currency=${currency}&locale=${locale}`;
  const request = useRequest<DealsResponse>(path, (signal) =>
    apiFetch<DealsResponse>(path, { signal }),
  );
  const data = request.status === "success" ? request.data : null;
  const error = request.status === "error" ? request.error.code : null;

  return (
    <div className="mt-2 space-y-6">
      <p className="max-w-2xl text-ink-muted">{t("subtitle", { origin })}</p>
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          {t("from")}
          <select
            value={origin}
            onChange={(e) => setOrigin(e.target.value)}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5"
          >
            {ORIGINS.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          {t("currency")}
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="rounded-lg border border-line bg-surface-1 px-2 py-1.5"
          >
            {CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {data && <Disclaimers codes={data.disclaimers} />}
      <div aria-live="polite">
        {!data && !error && <p className="text-ink-muted">{t("loading")}</p>}
        {error && (
          <p role="alert" className="text-red-700 dark:text-red-400">
            {results(error === "rate_limited" ? "errors.rate_limited" : "errors.generic")}
          </p>
        )}
        {data && data.deals.length === 0 && <p>{t("empty")}</p>}
        {data && data.deals.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.deals.map((d) => (
              <li key={d.destination_slug}>
                <Card className="flex h-full flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-display text-2xl font-semibold">{d.destination_name}</h2>
                    {d.is_demo && <Badge tone="demo">{demo("label")}</Badge>}
                  </div>
                  <p className="font-mono text-sm text-ink-muted">
                    {d.origin} ⇄ {d.destination}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {t("dates", {
                      depart: formatDate(d.depart_date, locale),
                      return: formatDate(d.return_date, locale),
                    })}
                  </p>
                  <p className="mt-auto text-2xl font-bold tabular-nums">
                    {formatMoney(d.price.amount, d.price.currency, locale)}
                  </p>
                  <p className="text-xs text-ink-muted">{t("roundTrip")}</p>
                  <Link
                    className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    href={{
                      pathname: "/flights",
                      query: {
                        from: d.origin,
                        to: d.destination,
                        toLabel: `${d.destination_name} (${d.destination})`,
                        trip: "round_trip",
                        depart: d.depart_date,
                        return: d.return_date,
                        adults: "1",
                        cabin: "economy",
                        currency: d.price.currency,
                      },
                    }}
                  >
                    {t("search")}
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
