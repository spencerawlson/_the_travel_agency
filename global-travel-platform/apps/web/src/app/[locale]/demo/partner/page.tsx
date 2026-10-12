import { Badge } from "@gtp/ui";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { BackButton } from "@/components/BackButton";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** Internal stand-in for a partner site. The mock provider's only redirect target. */
export default async function DemoPartnerPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("partner");
  const demo = await getTranslations("demo");

  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center">
      <Badge tone="demo">{demo("label")}</Badge>
      <h1 className="mt-4 font-display text-4xl font-semibold">{t("title")}</h1>
      <p className="mt-4 text-lg leading-relaxed">{t("body")}</p>
      <p className="mt-3 text-sm text-ink-muted">{t("recorded")}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <BackButton label={t("back")} />
        <Link
          href="/"
          className="rounded-xl border border-line px-4 py-2.5 text-sm font-semibold hover:bg-surface-2"
        >
          {t("home")}
        </Link>
      </div>
    </div>
  );
}
