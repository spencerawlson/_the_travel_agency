import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ResultsView } from "@/components/results/ResultsView";
import { getWidgetIds } from "@/lib/widgets";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  // Search result URLs are not useful search-engine landing pages.
  return { title: t("flights"), robots: { index: false, follow: true } };
}

export default async function FlightsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Suspense>
        <ResultsView widgetIds={getWidgetIds()} />
      </Suspense>
    </div>
  );
}
