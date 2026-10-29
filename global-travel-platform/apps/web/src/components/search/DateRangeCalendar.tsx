"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatDate, intlLocale } from "@/lib/format";

interface Props {
  departDate: string;
  returnDate: string;
  roundTrip: boolean;
  today: string;
  maxDate: string;
  locale: string;
  onChange: (departDate: string, returnDate: string) => void;
  onDone: () => void;
}

function parseIso(iso: string): [number, number, number] {
  return iso.split("-").map(Number) as [number, number, number];
}

function isoOf(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

/** One shared calendar for both ends of the trip. First tap sets departure,
 *  second tap (on or after departure) sets return; tapping an earlier day
 *  restarts the range at that day. One-way trips close after one tap. */
export function DateRangeCalendar({
  departDate,
  returnDate,
  roundTrip,
  today,
  maxDate,
  locale,
  onChange,
  onDone,
}: Props) {
  const t = useTranslations("search");
  const [ty, tm] = departDate ? parseIso(departDate) : parseIso(today);
  const [month, setMonth] = useState({ y: ty, m: tm });
  // Monday-first weeks in French, Sunday-first otherwise (en-CA convention).
  const weekStart = locale === "fr" ? 1 : 0;

  const monthLabel = new Intl.DateTimeFormat(intlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(month.y, month.m - 1, 1)));

  const weekdayLabels = Array.from({ length: 7 }, (_, i) => {
    // 2026-11-01 is a Sunday; offset to the locale's first weekday.
    const day = new Date(Date.UTC(2026, 10, 1 + ((weekStart + i) % 7)));
    return new Intl.DateTimeFormat(intlLocale(locale), {
      weekday: "short",
      timeZone: "UTC",
    }).format(day);
  });

  const daysInMonth = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(month.y, month.m - 1, 1)).getUTCDay();
  const leading = (firstWeekday - weekStart + 7) % 7;

  const monthKey = `${month.y}-${String(month.m).padStart(2, "0")}`;
  const todayKey = today.slice(0, 7);
  const maxKey = maxDate.slice(0, 7);
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(month.y, month.m - 1 + delta, 1));
    setMonth({ y: d.getUTCFullYear(), m: d.getUTCMonth() + 1 });
  };

  function pick(iso: string) {
    if (!roundTrip) {
      onChange(iso, "");
      onDone();
      return;
    }
    if (!departDate || (departDate && returnDate)) {
      onChange(iso, "");
      return;
    }
    if (iso >= departDate) {
      onChange(departDate, iso);
      onDone();
    } else {
      onChange(iso, "");
    }
  }

  return (
    <div role="group" aria-label={t("calendarLabel")} className="mt-3 rounded-xl border border-line bg-surface-1 p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label={t("prevMonth")}
          disabled={monthKey <= todayKey}
          onClick={() => shift(-1)}
          className="size-10 rounded-full border border-line text-lg disabled:opacity-40"
        >
          ‹
        </button>
        <p className="font-semibold capitalize">{monthLabel}</p>
        <button
          type="button"
          aria-label={t("nextMonth")}
          disabled={monthKey >= maxKey}
          onClick={() => shift(1)}
          className="size-10 rounded-full border border-line text-lg disabled:opacity-40"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdayLabels.map((label, i) => (
          <span key={i} className="py-1 text-xs font-semibold text-ink-muted uppercase">
            {label}
          </span>
        ))}
        {Array.from({ length: leading }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const iso = isoOf(month.y, month.m, i + 1);
          const disabled = iso < today || iso > maxDate;
          const isDepart = iso === departDate;
          const isReturn = iso === returnDate;
          const inRange =
            Boolean(departDate && returnDate) && iso > departDate && iso < returnDate;
          return (
            <button
              key={iso}
              type="button"
              disabled={disabled}
              onClick={() => pick(iso)}
              aria-label={formatDate(iso, locale)}
              aria-pressed={isDepart || isReturn}
              className={`flex h-11 items-center justify-center rounded-full text-sm disabled:opacity-40 ${
                isDepart || isReturn
                  ? "bg-brand-600 font-semibold text-white"
                  : inRange
                    ? "bg-brand-100 font-medium"
                    : "hover:bg-surface-2"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {roundTrip
            ? t("dateHint")
            : t("dateHintOneWay")}
        </p>
        <button
          type="button"
          onClick={onDone}
          className="shrink-0 rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white"
        >
          {t("calendarDone")}
        </button>
      </div>
    </div>
  );
}
