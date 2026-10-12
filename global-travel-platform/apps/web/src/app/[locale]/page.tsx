import { getTranslations, setRequestLocale } from "next-intl/server";
import { DestinationCard } from "@/components/DestinationCard";
import { SearchForm } from "@/components/search/SearchForm";
import { Link } from "@/i18n/navigation";
import { getDestinations } from "@/lib/server-api";

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("home");
  const destinations = (await getDestinations(locale)).slice(0, 6);

  return (
    <>
      <section className="hero-pattern border-b border-line">
        <div className="mx-auto max-w-6xl px-4 pt-12 pb-10 sm:pt-16">
          <p className="text-sm font-semibold tracking-wide text-brand-600 uppercase dark:text-brand-300">
            {t("eyebrow")}
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight font-semibold sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-ink-muted">{t("subtitle")}</p>
          <div className="mt-8 rounded-3xl border border-line bg-surface-1/95 p-4 shadow-xl sm:p-6">
            <SearchForm />
          </div>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
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
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-semibold">{t("destinationsTitle")}</h2>
            <p className="mt-1 text-ink-muted">{t("destinationsSubtitle")}</p>
          </div>
          <Link
            href="/destinations"
            className="font-semibold text-brand-600 hover:underline dark:text-brand-300"
          >
            {t("viewAll")} →
          </Link>
        </div>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {destinations.map((d) => (
            <li key={d.slug}>
              <DestinationCard destination={d} />
            </li>
          ))}
        </ul>
      </section>

      <section className="border-y border-line bg-surface-1">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="font-display text-3xl font-semibold">{t("howTitle")}</h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {([1, 2, 3] as const).map((n) => (
              <li key={n} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white">
                  {n}
                </span>
                <div>
                  <h3 className="font-semibold">{t(`how${n}Title`)}</h3>
                  <p className="mt-1 text-ink-muted">{t(`how${n}`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
