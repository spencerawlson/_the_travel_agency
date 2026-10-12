"use client";

import type { Airport } from "@gtp/shared-types";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AirportChoice } from "@/lib/search";

export function airportLabel(a: Pick<Airport, "city" | "iata">): string {
  return `${a.city} (${a.iata})`;
}

interface Props {
  label: string;
  value: AirportChoice | null;
  onChange: (value: AirportChoice | null) => void;
  error?: string;
  /** Injectable for tests. */
  fetchAirports?: (q: string, signal: AbortSignal) => Promise<Airport[]>;
}

const defaultFetch = (q: string, signal: AbortSignal) =>
  apiFetch<Airport[]>(`/api/v1/airports/search?q=${encodeURIComponent(q)}&limit=8`, { signal });

/** WAI-ARIA 1.2 combobox with listbox popup and debounced server autocomplete. */
export function AirportCombobox({
  label,
  value,
  onChange,
  error,
  fetchAirports = defaultFetch,
}: Props) {
  const t = useTranslations("search");
  const id = useId();
  const listId = `${id}-list`;
  const errorId = `${id}-error`;
  const [text, setText] = useState(value?.label ?? "");
  const [options, setOptions] = useState<Airport[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the input text in sync when the value changes externally (e.g. swap).
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setText(value?.label ?? "");
  }

  const query = text.trim();
  const shouldSearch = open && query.length >= 2 && query !== value?.label;

  useEffect(() => {
    if (!shouldSearch) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchAirports(query, controller.signal);
        setOptions(results);
        setActive(results.length ? 0 : -1);
      } catch (err) {
        if ((err as Error).name !== "AbortError") setOptions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, shouldSearch, fetchAirports]);

  function select(a: Airport) {
    onChange({ iata: a.iata, label: airportLabel(a) });
    setText(airportLabel(a));
    setOpen(false);
    setOptions([]);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && open && active >= 0 && options[active]) {
      e.preventDefault();
      select(options[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && shouldSearch;
  const describedBy = error ? errorId : undefined;

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="mb-1 block text-xs font-semibold tracking-wide text-ink-muted uppercase"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder={t("airportPlaceholder")}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (value) onChange(null); // typing invalidates the previous selection
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 120);
        }}
        onKeyDown={onKeyDown}
        className="w-full rounded-xl border border-line bg-surface-1 px-3 py-3 text-base text-ink placeholder:text-ink-muted/70 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30 focus:outline-none aria-[invalid=true]:border-red-500"
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-line bg-surface-1 p-1 shadow-xl"
          onMouseDown={(e) => e.preventDefault()}
        >
          {loading && options.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted">{t("loadingAirports")}</li>
          )}
          {!loading && options.length === 0 && (
            <li className="px-3 py-2 text-sm text-ink-muted">{t("noAirports")}</li>
          )}
          {options.map((a, i) => (
            <li
              key={a.iata}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 aria-selected:bg-brand-50"
              onMouseEnter={() => setActive(i)}
              onClick={() => select(a)}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{a.city}</span>
                <span className="block truncate text-xs text-ink-muted">
                  {a.name}, {a.country_name}
                </span>
              </span>
              <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-sm font-semibold">
                {a.iata}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p id={errorId} className="mt-1 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
