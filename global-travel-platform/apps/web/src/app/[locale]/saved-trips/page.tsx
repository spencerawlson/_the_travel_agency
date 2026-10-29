import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";

import { SavedTripsView } from "@/components/app/SavedTripsView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  // Personal on-device data: never a search landing page.
  return { title: t("savedTrips"), robots: { index: false, follow: false } };
}

export default async function SavedTripsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app" });
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">{t("savedTrips")}</h1>
      <div className="mt-6">
        <Suspense>
          <SavedTripsView locale={locale} />
        </Suspense>
      </div>
    </div>
  );
}
