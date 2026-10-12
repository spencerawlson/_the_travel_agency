import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SearchForm } from "@/components/search/SearchForm";
import { Link } from "@/i18n/navigation";
import { defaultForm } from "@/lib/search";
import { getDestination } from "@/lib/server-api";

type Params = Promise<{ locale: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const d = await getDestination(slug, locale);
  return d ? { title: d.name, description: d.summary } : {};
}

export default async function DestinationPage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const d = await getDestination(slug, locale);
  if (!d) notFound();
  const t = await getTranslations("destinations");
  const initial = {
    ...defaultForm(),
    destination: { iata: d.airport_iata, label: `${d.name} (${d.airport_iata})` },
  };

  return (
    <article>
      <div className={`theme-${d.theme}`}>
        <div className="mx-auto max-w-6xl px-4 pt-16 pb-12 text-white">
          <Link
            href="/destinations"
            className="text-sm font-semibold text-white/85 hover:underline"
          >
            ← {t("back")}
          </Link>
          <h1 className="mt-4 font-display text-5xl font-semibold drop-shadow">{d.name}</h1>
          <p className="mt-3 max-w-2xl text-lg text-white/90">{d.summary}</p>
          <p className="mt-2 font-mono text-sm text-white/80">
            {t("airport", { iata: d.airport_iata })}
          </p>
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 lg:grid-cols-[1fr_1fr]">
        <div>
          <p className="text-lg leading-relaxed">{d.description}</p>
          <h2 className="mt-8 font-display text-2xl font-semibold">{t("highlights")}</h2>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-ink-muted">
            {d.highlights.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </div>
        <section
          aria-labelledby="dest-search"
          className="rounded-2xl border border-line bg-surface-1 p-5"
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
