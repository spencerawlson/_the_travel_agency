import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { getSiteConfig } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "about" });
  return { title: t("title") };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("about");
  const legal = await getTranslations("legal");
  const site = getSiteConfig();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
      <p className="mt-4 text-lg leading-relaxed">{t("intro", { site: site.name })}</p>
      {(["what", "not", "money"] as const).map((key) => (
        <section key={key} className="mt-8">
          <h2 className="font-display text-2xl font-semibold">{t(`${key}Title`)}</h2>
          <p className="mt-2 leading-relaxed text-ink-muted">{t(key)}</p>
        </section>
      ))}
      <p className="mt-8">
        <Link
          href="/legal/affiliate-disclosure"
          className="font-semibold text-brand-600 hover:underline"
        >
          {legal("affiliate")} →
        </Link>
      </p>
    </div>
  );
}
