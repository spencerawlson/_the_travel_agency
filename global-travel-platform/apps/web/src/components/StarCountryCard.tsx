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
      <div
        className={`star-card star-${country.theme} overflow-hidden rounded-3xl shadow-xl ring-1 ring-line/60`}
      >
        <div className="px-6 py-10 sm:px-10 sm:py-12">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white ring-1 ring-white/30">
            <span aria-hidden>⭐</span> {t("starTitle")}
          </p>
          <h2 className="mt-4 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            {text.name}
          </h2>
          <p className="mt-3 max-w-2xl text-lg text-white/90 italic">{text.tagline}</p>

          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {blocks.map((b) => (
              <li key={b.key} className="rounded-2xl bg-black/[0.18] p-5 ring-1 ring-white/15">
                <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                  <span aria-hidden>{b.emoji}</span> {t(b.key)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-white/[0.92]">{b.body}</p>
              </li>
            ))}
          </ul>

          <div className="mt-8">
            <Link
              href="/destinations"
              className="inline-block rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              {t("starCta")} →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
