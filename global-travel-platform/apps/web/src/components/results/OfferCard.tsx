"use client";

import type { FlightOffer, FlightSlice } from "@gtp/shared-types";
import { Badge, Button, Card } from "@gtp/ui";
import { useLocale, useTranslations } from "next-intl";
import { dayOffset, formatDate, formatDuration, formatLocalTime, formatMoney } from "@/lib/format";

function SliceRow({ label, slice }: { label: string; slice: FlightSlice }) {
  const t = useTranslations("results");
  const locale = useLocale();
  const first = slice.segments[0];
  const last = slice.segments[slice.segments.length - 1];
  if (!first || !last) return null;
  const plusDays = dayOffset(first.depart_at, last.arrive_at);
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-center gap-3 sm:gap-6">
      <div className="text-right">
        <p className="text-xs text-ink-muted">{formatDate(first.depart_at.slice(0, 10), locale)}</p>
        <p className="text-lg font-semibold tabular-nums">
          {formatLocalTime(first.depart_at, locale)}
        </p>
        <p className="font-mono text-xs text-ink-muted">{first.origin}</p>
      </div>
      <div className="text-center">
        <p className="text-xs text-ink-muted">
          <span className="sr-only">{label}: </span>
          {formatDuration(slice.duration_minutes)}
        </p>
        <div aria-hidden className="relative my-1 h-px bg-line">
          {Array.from({ length: slice.stops }).map((_, i) => (
            <span
              key={i}
              className="absolute top-1/2 size-2 -translate-y-1/2 rounded-full border border-ink-muted bg-surface-1"
              style={{ left: `${((i + 1) / (slice.stops + 1)) * 100}%` }}
            />
          ))}
        </div>
        <p className={`text-xs ${slice.stops === 0 ? "text-emerald-700" : "text-ink-muted"}`}>
          {t("stops", { count: slice.stops })}
        </p>
      </div>
      <div>
        <p className="text-lg font-semibold tabular-nums">
          {formatLocalTime(last.arrive_at, locale)}
          {plusDays > 0 && <sup className="ml-0.5 text-xs text-accent-500">+{plusDays}</sup>}
        </p>
        <p className="font-mono text-xs text-ink-muted">{last.destination}</p>
      </div>
    </div>
  );
}

interface Props {
  offer: FlightOffer;
  onSelect: (offer: FlightOffer) => void;
  busy: boolean;
  /** App-only ticket treatment: vertical card, dashed divider, plane badge. */
  ticket?: boolean;
}

/** Offer notes worth showing on the card, in display order. */
const NOTE_CODES = ["demo_fare", "different_dates", "economy_only", "cached_fare"] as const;

export function OfferCard({ offer, onSelect, busy, ticket = false }: Props) {
  const t = useTranslations("results");
  const demo = useTranslations("demo");
  const locale = useLocale();
  const carrier = offer.outbound.segments[0]?.carrier_name ?? offer.seller_name;
  const perAdult = offer.price_basis === "per_adult";

  return (
    <Card className={ticket ? "flex flex-col gap-4" : "flex flex-col gap-4 md:flex-row md:items-center"}>
      <div className="flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{carrier}</p>
          {offer.is_demo && <Badge tone="demo">{demo("label")}</Badge>}
        </div>
        <SliceRow label={t("outbound")} slice={offer.outbound} />
        {offer.inbound && <SliceRow label={t("inbound")} slice={offer.inbound} />}
      </div>
      <div
        className={
          ticket
            ? "relative flex flex-col gap-2 border-t border-dashed border-line pt-4"
            : "flex flex-col gap-2 border-t border-line pt-4 md:w-56 md:border-t-0 md:border-l md:pt-0 md:pl-6"
        }
      >
        {ticket && (
          <span
            aria-hidden="true"
            className="absolute -top-3.5 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full bg-surface-1 text-brand-600 ring-1 ring-line"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
              <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z" />
            </svg>
          </span>
        )}
        {perAdult && <p className="text-xs font-medium text-ink-muted">{t("from")}</p>}
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(offer.price.amount, offer.price.currency, locale)}
        </p>
        <p className="text-xs text-ink-muted">
          {perAdult ? t("perAdultEconomy") : t("totalPrice")}
        </p>
        <p className="text-xs text-ink-muted">
          {offer.notes.includes("seller_on_partner")
            ? offer.seller_name === "Aviasales"
              ? t("comparedOn", { provider: "Aviasales" })
              : t("fareFrom", { seller: offer.seller_name })
            : `${t("soldBy", { seller: offer.seller_name })} · ${t("via", { provider: offer.provider_name })}`}
        </p>
        {NOTE_CODES.filter((code) => offer.notes.includes(code)).map((code) => (
          <p
            key={code}
            className={`text-xs ${code === "demo_fare" ? "text-amber-800" : "text-ink-muted"}`}
          >
            {t(`notes.${code}`)}
          </p>
        ))}
        {offer.bookable ? (
          <Button onClick={() => onSelect(offer)} disabled={busy} className="mt-1">
            {busy ? t("redirecting") : t("viewDeal")}
          </Button>
        ) : (
          <div className="mt-1 space-y-1">
            <Button disabled className="w-full" aria-describedby={`soon-${offer.id}`}>
              {t("bookingSoon")}
            </Button>
            <p id={`soon-${offer.id}`} className="text-xs text-ink-muted">
              {t("bookingSoonHint")}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
