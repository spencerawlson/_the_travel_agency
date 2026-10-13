import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DealsView } from "@/components/DealsView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "deals" });
  return { title: t("title") };
}

export default async function DealsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("deals");
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
      <DealsView />
    </div>
  );
}
