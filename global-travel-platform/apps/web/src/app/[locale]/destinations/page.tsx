import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { DestinationCard } from "@/components/DestinationCard";
import { getDestinations } from "@/lib/server-api";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "destinations" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function DestinationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("destinations");
  const destinations = await getDestinations(locale);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
      <p className="mt-2 max-w-2xl text-ink-muted">{t("subtitle")}</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {destinations.map((d) => (
          <li key={d.slug}>
            <DestinationCard destination={d} />
          </li>
        ))}
      </ul>
    </div>
  );
}
