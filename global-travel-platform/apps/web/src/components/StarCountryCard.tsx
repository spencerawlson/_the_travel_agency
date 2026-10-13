import { getStarCountry, starCountryText } from "@/lib/star-country";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/**
 * "Country of the week" showcase — the country rotates automatically every
 * Monday (see lib/star-country.ts). No admin action needed.
 */
export async function StarCountryCard({ locale }: { locale: string }) {
  const t = await getTranslations("home");
  const country = getStarCountry();
  const text = starCountryText(country, locale);

  const blocks = [
    { key: "starFood", emoji: "🍽️", body: text.food },
    { key: "starCulture", emoji: "🎭", body: text.culture },
    { key: "starSights", emoji: "📸", body: text.sights },
    { key: "starKnownFor", emoji: "✨", body: text.knownFor },
  ] as const;

  return (
    <section aria-label={t("starTitle")} className="mx-auto max-w-6xl px-4 pt-16">
      <div className="star-card overflow-hidden rounded-3xl ring-1 ring-white/70">
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <p className="glass-tile inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-brand-700">
            <span aria-hidden>⭐</span> {t("starTitle")}
          </p>
          <h2 className="star-name mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            {text.name}
          </h2>
          <span aria-hidden className="star-rule mt-4 block h-1 w-20 rounded-full" />
          <p className="mt-4 max-w-2xl text-lg text-ink-muted italic">{text.tagline}</p>

          <ul
            // Phones: one swipeable row (saves four screens of scrolling); md+: 2x2 grid.
            tabIndex={0}
            aria-label={t("starTitle")}
            className="-mx-6 mt-8 flex snap-x snap-mandatory [scrollbar-width:thin] gap-4 overflow-x-auto px-6 pb-3 focus-visible:outline-2 focus-visible:outline-brand-500 sm:-mx-10 sm:px-10 md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0"
          >
            {blocks.map((b) => (
              <li
                key={b.key}
                className="glass-tile w-[85%] shrink-0 snap-start rounded-2xl p-5 md:w-auto"
              >
                <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
                  <span aria-hidden>{b.emoji}</span> {t(b.key)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-muted">{b.body}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <Link
              href="/destinations"
              className="inline-block rounded-full bg-brand-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md"
            >
              {t("starCta")} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
