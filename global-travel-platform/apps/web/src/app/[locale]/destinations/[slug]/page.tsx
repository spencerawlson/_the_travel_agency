import type { Destination } from "@gtp/shared-types";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { LocalTime } from "@/components/LocalTime";
import { Photo, PhotoCaption } from "@/components/Photo";
import { SearchForm } from "@/components/search/SearchForm";
import { Link } from "@/i18n/navigation";
import { formatDuration, intlLocale } from "@/lib/format";
import { getPhoto } from "@/lib/photos";
import { defaultForm } from "@/lib/search";
import { getDestination } from "@/lib/server-api";

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const d = await getDestination(slug, locale);
  return d ? { title: d.name, description: d.summary } : {};
}

/** Capitalise the first letter only ("avril, mai et juin" -> "Avril, mai et juin"). */
function sentenceCase(text: string, locale: string): string {
  return text.charAt(0).toLocaleUpperCase(intlLocale(locale)) + text.slice(1);
}

function monthNames(months: number[], locale: string): string {
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), { month: "long", timeZone: "UTC" });
  const names = months.map((m) => fmt.format(new Date(Date.UTC(2000, m - 1, 1))));
  return sentenceCase(
    new Intl.ListFormat(intlLocale(locale), { type: "conjunction" }).format(names),
    locale,
  );
}

function displayName(type: "currency" | "language", code: string, locale: string): string {
  try {
    return sentenceCase(new Intl.DisplayNames([intlLocale(locale)], { type }).of(code) ?? code, locale);
  } catch {
    return code;
  }
}

function languageList(codes: string[], locale: string): string {
  const names = codes.map((code) => {
    try {
      return new Intl.DisplayNames([intlLocale(locale)], { type: "language" }).of(code) ?? code;
    } catch {
      return code;
    }
  });
  return sentenceCase(
    new Intl.ListFormat(intlLocale(locale), { type: "conjunction" }).format(names),
    locale,
  );
}

function Fact({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-surface-1 p-4 shadow-sm ring-1 ring-line/60">
      <span aria-hidden className="text-2xl leading-none">
        {icon}
      </span>
      <div>
        <dt className="text-xs font-semibold tracking-wide text-ink-muted uppercase">{label}</dt>
        <dd className="mt-1 font-medium">{children}</dd>
      </div>
    </div>
  );
}

function Facts({
  d,
  locale,
  t,
}: {
  d: Destination;
  locale: string;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {d.best_months.length > 0 && (
        <Fact icon="☀️" label={t("facts.bestTime")}>
          {monthNames(d.best_months, locale)}
        </Fact>
      )}
      {d.approx_flight_minutes != null && (
        <Fact icon="✈️" label={t("facts.flightTime")}>
          {t("facts.flightValue", { time: formatDuration(d.approx_flight_minutes) })}
        </Fact>
      )}
      <Fact icon="🕒" label={t("facts.localTime")}>
        <LocalTime timeZone={d.timezone} />
      </Fact>
      {d.currency && (
        <Fact icon="💱" label={t("facts.currency")}>
          {displayName("currency", d.currency, locale)} (
          {d.currency})
        </Fact>
      )}
      {d.languages.length > 0 && (
        <Fact icon="💬" label={t("facts.languages")}>
          {languageList(d.languages, locale)}
        </Fact>
      )}
    </dl>
  );
}

export default async function DestinationPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const d = await getDestination(slug, locale);
  if (!d) notFound();
  const t = await getTranslations("destinations");
  const photo = getPhoto(d.slug);
  const initial = {
    ...defaultForm(),
    origin: { iata: "YUL", label: "Montréal (YUL)" },
    destination: { iata: d.airport_iata, label: `${d.name} (${d.airport_iata})` },
  };

  return (
    <article>
      <header className="relative isolate flex min-h-[62vh] items-end overflow-hidden sm:min-h-[70vh]">
        <Photo photo={photo} locale={locale} fallbackClass={`theme-${d.theme}`} priority />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
        />
        <div className="relative mx-auto w-full max-w-6xl px-4 pt-24 pb-10 text-white">
          <Link
            href="/destinations"
            className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-semibold backdrop-blur hover:bg-white/30"
          >
            ← {t("back")}
          </Link>
          <h1 className="mt-5 font-display text-6xl font-semibold tracking-tight drop-shadow sm:text-7xl">
            {d.name}
          </h1>
          <p className="mt-3 max-w-2xl text-xl text-white/95 drop-shadow">{d.summary}</p>
          <p className="mt-6 text-xs text-white/80">
            <PhotoCaption photo={photo} />
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-10">
          <p className="text-xl leading-relaxed">{d.description}</p>
          <section>
            <h2 className="font-display text-3xl font-semibold">{t("facts.title")}</h2>
            <div className="mt-4">
              <Facts d={d} locale={locale} t={t} />
            </div>
            {d.approx_flight_minutes != null && (
              <p className="mt-3 text-xs text-ink-muted">{t("facts.flightNote")}</p>
            )}
          </section>
          <section>
            <h2 className="font-display text-3xl font-semibold">{t("highlights")}</h2>
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {d.highlights.map((h) => (
                <li
                  key={h}
                  className="rounded-2xl bg-surface-2 p-4 font-medium ring-1 ring-line/60"
                >
                  <span aria-hidden className="mr-2 text-accent-600">
                    ✦
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          </section>
        </div>
        <section
          aria-labelledby="dest-search"
          className="h-fit rounded-3xl bg-surface-1 p-6 shadow-xl ring-1 shadow-brand-900/5 ring-line/60 lg:sticky lg:top-28"
        >
          <h2 id="dest-search" className="mb-4 font-display text-2xl font-semibold">
            {t("searchFlights", { name: d.name })}
          </h2>
          <SearchForm initial={initial} compact />
        </section>
      </div>
    </article>
  );
}
