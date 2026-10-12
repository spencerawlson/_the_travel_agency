/** Locale-aware formatting using the platform Intl APIs (no hard-coded formats). */

const INTL_LOCALE: Record<string, string> = { en: "en-CA", fr: "fr-CA" };

export function intlLocale(locale: string): string {
  return INTL_LOCALE[locale] ?? locale;
}

export function formatMoney(amount: string | number, currency: string, locale: string): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

/** Time at the airport, read from the ISO offset (e.g. "2030-05-01T14:45:00-04:00"). */
export function formatLocalTime(iso: string, locale: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(iso);
  if (!match) return iso;
  const date = new Date(Date.UTC(2000, 0, 1, Number(match[1]), Number(match[2])));
  return new Intl.DateTimeFormat(intlLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(date);
}

/** Calendar day difference between two local ISO timestamps (for "+1" arrivals). */
export function dayOffset(departIso: string, arriveIso: string): number {
  const d = Date.UTC(
    ...(departIso.slice(0, 10).split("-").map(Number) as [number, number, number]),
  );
  const a = Date.UTC(
    ...(arriveIso.slice(0, 10).split("-").map(Number) as [number, number, number]),
  );
  return Math.round((a - d) / 86_400_000);
}

export function formatDate(isoDate: string, locale: string): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatPercent(value: number | null, locale: string, na: string): string {
  if (value === null) return na;
  return new Intl.NumberFormat(intlLocale(locale), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}
