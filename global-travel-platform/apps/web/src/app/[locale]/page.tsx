import { getTranslations, setRequestLocale } from "next-intl/server";
import { Globe } from "@/components/Globe";
import { HeroBackdrop } from "@/components/HeroBackdrop";
import { Photo } from "@/components/Photo";
import { SearchForm } from "@/components/search/SearchForm";
import { Link } from "@/i18n/navigation";
import { getPhoto, photoAlt, type Mood } from "@/lib/photos";
import { getDestinations, getOrigin, originCity } from "@/lib/server-api";

const MOOD_PHOTOS: Record<Mood, string> = {
  beach: "mood-beach",
  city: "new-york",
  nature: "vancouver",
  culture: "marrakech",
};

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const destinations = await getDestinations(locale);
  const origin = await getOrigin();
  const city = originCity(origin, locale);
  const hub = origin ? { latitude: origin.latitude, longitude: origin.longitude } : null;
  const slides = destinations.flatMap((d) => {
    const p = getPhoto(d.slug);
    return p
      ? [
          {
            slug: d.slug,
            name: d.name,
            src: p.src,
            srcSmall: p.srcSmall,
            alt: photoAlt(p, locale),
            focus: p.focus,
            credit: `© ${p.author}`,
          },
        ]
      : [];
  });
  const globePoints = destinations.map((d) => ({
    slug: d.slug,
    name: d.name,
    latitude: d.latitude,
    longitude: d.longitude,
  }));

  return (
    <>
      {/* ---------- Hero: photo carousel backdrop + headline + globe ---------- */}
      <section className="relative isolate overflow-hidden border-b border-line/60">
        <HeroBackdrop slides={slides} />
        <div className="mx-auto grid max-w-6xl items-center gap-6 px-4 pt-10 pb-6 md:grid-cols-[1.1fr_1fr] md:pt-14 md:pb-10">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-sm font-semibold text-brand-700 shadow-sm ring-1 ring-brand-100">
              <span aria-hidden>✈</span> {t("eyebrow")}
            </p>
            <h1 className="mt-5 font-display text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-6xl">
              {t("title")}
            </h1>
            <p className="mt-5 max-w-xl text-lg text-ink-muted">{t("subtitle")}</p>
            <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-muted">
              {(["trust1", "trust2", "trust3"] as const).map((k) => (
                <li key={k} className="flex items-center gap-2">
                  <span aria-hidden className="text-emerald-600">
                    ✓
                  </span>
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-[300px] sm:max-w-[420px] md:max-w-[520px]">
            <Globe
              points={globePoints}
              hub={hub}
              label={city ? t("globeLabel", { city }) : t("globeLabelAny")}
            />
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 pb-10">
          <div className="rounded-3xl border border-white/70 bg-white/90 p-4 shadow-2xl shadow-brand-900/10 backdrop-blur sm:p-6">
            <SearchForm
              defaultOrigin={
                origin && city
                  ? { iata: origin.iata, label: `${city} (${origin.iata})` }
                  : undefined
              }
            />
          </div>
        </div>
      </section>

      {/* ---------- What kind of trip? ---------- */}
      <section className="mx-auto max-w-6xl px-4 pt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl font-semibold tracking-tight">{t("moodTitle")}</h2>
            <p className="mt-2 text-ink-muted">{t("moodSubtitle")}</p>
          </div>
          <Link
            href="/destinations"
            className="rounded-full bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700"
          >
            {t("viewAll")} →
          </Link>
        </div>
        <ul className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {(Object.keys(MOOD_PHOTOS) as Mood[]).map((mood) => (
            <li key={mood}>
              <Link
                href={{ pathname: "/destinations", query: { mood } }}
                className="photo-zoom group relative block aspect-[3/4] overflow-hidden rounded-3xl shadow-sm ring-1 ring-line/60 transition hover:-translate-y-1 hover:shadow-xl"
              >
                <Photo
                  photo={getPhoto(MOOD_PHOTOS[mood])}
                  locale={locale}
                  sizes="(min-width: 1024px) 280px, 50vw"
                />
                <div
                  aria-hidden
                  className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 p-4 text-white sm:p-5">
                  <p className="font-display text-2xl font-semibold sm:text-3xl">
                    {t(`moods.${mood}.title`)}
                  </p>
                  <p className="mt-1 hidden text-sm text-white/90 sm:block">
                    {t(`moods.${mood}.blurb`)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="border-t border-line bg-surface-2">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-4xl font-semibold tracking-tight">{t("howTitle")}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className="rounded-3xl bg-surface-1 p-6 shadow-sm ring-1 ring-line/60">
                <span className="flex size-11 items-center justify-center rounded-full bg-accent-500 text-lg font-bold text-white">
                  {n}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{t(`how${n}Title`)}</h3>
                <p className="mt-1 text-ink-muted">{t(`how${n}`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
