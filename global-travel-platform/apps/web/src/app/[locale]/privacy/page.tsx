import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalDocumentView } from "@/components/LegalDocument";
import { getLegalDocument } from "@/content/legal";
import { pageMetadata } from "@/lib/seo";
import { getSiteConfig } from "@/lib/site";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const d = getLegalDocument(locale, "privacy", getSiteConfig());
  return pageMetadata(locale, "/privacy", { title: d.title, description: d.summary });
}

export default async function PrivacyPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const site = getSiteConfig();
  const d = getLegalDocument(locale, "privacy", site);
  return (
    <LegalDocumentView doc={d} lastUpdated={t("lastUpdated", { date: site.legalLastUpdated })} />
  );
}
