import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalDocumentView } from "@/components/LegalDocument";
import { getLegalDocument } from "@/content/legal";
import { pageMetadata } from "@/lib/seo";
import { getSiteConfig } from "@/lib/site";

type Params = Promise<{ locale: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale } = await params;
  const d = getLegalDocument(locale, "terms", getSiteConfig());
  return pageMetadata(locale, "/terms", { title: d.title, description: d.summary });
}

export default async function TermsPage({ params }: { params: Params }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const site = getSiteConfig();
  const d = getLegalDocument(locale, "terms", site);
  return (
    <LegalDocumentView doc={d} lastUpdated={t("lastUpdated", { date: site.legalLastUpdated })} />
  );
}
