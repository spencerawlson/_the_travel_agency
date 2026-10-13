import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DealsView } from "@/components/DealsView";
import { getOrigin } from "@/lib/server-api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "deals" });
  return pageMetadata(locale, "/deals", { title: t("title"), description: t("subtitleAny") });
}

export default async function DealsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("deals");
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
      <DealsView defaultOrigin={(await getOrigin())?.iata} />
    </div>
  );
}
