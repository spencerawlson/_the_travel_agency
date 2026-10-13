"use client";

import type { FlightOffer, FlightSlice } from "@gtp/shared-types";
import { Badge, Button, Card } from "@gtp/ui";
import { useLocale, useTranslations } from "next-intl";
import { dayOffset, formatDuration, formatLocalTime, formatMoney } from "@/lib/format";

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
}

export function OfferCard({ offer, onSelect, busy }: Props) {
  const t = useTranslations("results");
  const demo = useTranslations("demo");
  const disclaimers = useTranslations("disclaimers");
  const locale = useLocale();
  const carrier = offer.outbound.segments[0]?.carrier_name ?? offer.seller_name;

  return (
    <Card className="flex flex-col gap-4 md:flex-row md:items-center">
      <div className="flex-1 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold">{carrier}</p>
          {offer.is_demo && <Badge tone="demo">{demo("label")}</Badge>}
        </div>
        <SliceRow label={t("outbound")} slice={offer.outbound} />
        {offer.inbound && <SliceRow label={t("inbound")} slice={offer.inbound} />}
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-4 md:w-56 md:border-t-0 md:border-l md:pt-0 md:pl-6">
        <p className="text-2xl font-bold tabular-nums">
          {formatMoney(offer.price.amount, offer.price.currency, locale)}
        </p>
        <p className="text-xs text-ink-muted">{t("totalPrice")}</p>
        <p className="text-xs text-ink-muted">
          {t("soldBy", { seller: offer.seller_name })} ·{" "}
          {t("via", { provider: offer.provider_name })}
        </p>
        {offer.notes.includes("demo_fare") && (
          <p className="text-xs text-amber-800">{disclaimers("demo_fare")}</p>
        )}
        <Button onClick={() => onSelect(offer)} disabled={busy} className="mt-1">
          {busy ? t("redirecting") : t("viewDeal")}
        </Button>
      </div>
    </Card>
  );
}
