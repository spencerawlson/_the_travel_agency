"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";

type Field = "adults" | "children" | "infants";

interface Props {
  adults: number;
  childCount: number;
  infants: number;
  onChange: (field: Field, value: number) => void;
  error?: string;
}

export function PassengerPicker({ adults, childCount, infants, onChange, error }: Props) {
  const t = useTranslations("search");
  const id = useId();
  const total = adults + childCount + infants;
  const rows: { field: Field; value: number; min: number; max: number }[] = [
    { field: "adults", value: adults, min: 1, max: 9 },
    { field: "children", value: childCount, min: 0, max: 8 },
    { field: "infants", value: infants, min: 0, max: 4 },
  ];

  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none rounded-xl border border-line bg-surface-1 px-3 py-3 text-base aria-[invalid=true]:border-red-500 [&::-webkit-details-marker]:hidden">
        <span className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {t("passengers")}
        </span>
        {t("passengerSummary", { count: total })}
      </summary>
      <div
        role="group"
        aria-labelledby={`${id}-title`}
        className="absolute z-30 mt-1 w-72 rounded-xl border border-line bg-surface-1 p-4 shadow-xl"
      >
        <p id={`${id}-title`} className="sr-only">
          {t("passengers")}
        </p>
        {rows.map(({ field, value, min, max }) => {
          const label = t(field);
          return (
            <div key={field} className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium">{label}</p>
                <p className="text-xs text-ink-muted">{t(`${field}Hint`)}</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="size-9 rounded-full border border-line text-lg disabled:opacity-40"
                  aria-label={t("decrease", { label })}
                  disabled={value <= min}
                  onClick={() => onChange(field, value - 1)}
                >
                  −
                </button>
                <output aria-live="polite" className="w-5 text-center font-semibold">
                  {value}
                </output>
                <button
                  type="button"
                  className="size-9 rounded-full border border-line text-lg disabled:opacity-40"
                  aria-label={t("increase", { label })}
                  disabled={value >= max}
                  onClick={() => onChange(field, value + 1)}
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
    </details>
  );
}
