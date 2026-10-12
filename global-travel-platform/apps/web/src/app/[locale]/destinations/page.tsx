import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DestinationCard } from "@/components/DestinationCard";
import { Link } from "@/i18n/navigation";
import { isMood, matchesMood, MOODS, type Mood } from "@/lib/photos";
import { getDestinations } from "@/lib/server-api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "destinations" });
  return { title: t("title"), description: t("subtitle") };
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

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map((d, i) => (
          <li key={d.slug}>
            <DestinationCard destination={d} priority={i < 3} />
          </li>
        ))}
      </ul>
    </div>
  );
}
