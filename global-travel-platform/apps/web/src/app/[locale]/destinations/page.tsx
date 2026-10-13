import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DestinationSearch } from "@/components/DestinationSearch";
import { DestinationsGlobe } from "@/components/DestinationsGlobe";
import { Link } from "@/i18n/navigation";
import { isMood, matchesMood, MOODS, type Mood } from "@/lib/photos";
import { getDestinations, getOrigin } from "@/lib/server-api";
import { fold } from "@/lib/text-search";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "destinations" });
  return pageMetadata(locale, "/destinations", { title: t("title"), description: t("subtitle") });
}

export default async function DestinationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ mood?: string }>;
}) {
  const { locale } = await params;
  const { mood: rawMood } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("destinations");
  const home = await getTranslations("home");
  const mood: Mood | null = isMood(rawMood) ? rawMood : null;
  const all = await getDestinations(locale);
  const destinations = mood ? all.filter((d) => matchesMood(d.tags, mood)) : all;
  const origin = await getOrigin();
  // Fall back to Montréal when the visitor's origin is unknown.
  const hub = origin ?? { latitude: 45.5, longitude: -73.57 };

  // Search every destination (not only the selected mood) by name, city, airport
  // and country in both languages: "Japon" and "Japan" both find Tokyo.
  const regions = ["en", "fr"].map((l) => new Intl.DisplayNames([l], { type: "region" }));
  const countryName = (code: string, i: number) => {
    try {
      return regions[i]!.of(code.toUpperCase()) ?? code;
    } catch {
      return code;
    }
  };
  const lang = locale === "fr" ? 1 : 0;
  const searchable = [...all]
    .sort((a, b) => a.name.localeCompare(b.name, locale))
    .map((d) => ({
      slug: d.slug,
      name: d.name,
      country: countryName(d.country_code, lang),
      keywords: fold(
        [
          d.name,
          d.city,
          d.airport_iata,
          countryName(d.country_code, 0),
          countryName(d.country_code, 1),
        ].join(" "),
      ),
    }));

  const chip = (active: boolean) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition ${
      active
        ? "bg-brand-600 text-white shadow-sm"
        : "bg-surface-1 text-ink ring-1 ring-line hover:bg-surface-2"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-5xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-3 max-w-2xl text-lg text-ink-muted">{t("subtitle")}</p>

      <nav aria-label={t("filterLabel")} className="mt-8">
        <ul className="flex flex-wrap gap-2">
          <li>
            <Link
              href="/destinations"
              className={chip(!mood)}
              aria-current={!mood ? "page" : undefined}
            >
              {t("allMoods")}
            </Link>
          </li>
          {(Object.keys(MOODS) as Mood[]).map((m) => (
            <li key={m}>
              <Link
                href={{ pathname: "/destinations", query: { mood: m } }}
                className={chip(mood === m)}
                aria-current={mood === m ? "page" : undefined}
              >
                {home(`moods.${m}.title`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* ---------- Interactive 3D globe: click a destination, fly there ----------
          Keyed by mood so the globe rebuilds with only the matching markers. */}
      <div className="mt-10">
        <DestinationsGlobe
          key={mood ?? "all"}
          locale={locale}
          destinations={destinations.map((d) => ({
            slug: d.slug,
            name: d.name,
            latitude: d.latitude,
            longitude: d.longitude,
          }))}
          hub={hub}
        />
      </div>

      {/* ---------- Type-to-find + "browse all" links (no globe needed) ---------- */}
      <DestinationSearch items={searchable} />
    </div>
  );
}
