import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getLegalDocument, isLegalDoc } from "@/content/legal";
import { getSiteConfig } from "@/lib/site";
import { LegalDocumentView } from "@/components/LegalDocument";

type Params = Promise<{ locale: string; doc: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isLegalDoc(doc)) return {};
  const d = getLegalDocument(locale, doc, getSiteConfig());
  return pageMetadata(locale, `/legal/${doc}`, { title: d.title, description: d.summary });
}

// Legacy alias: /[locale]/legal/[doc] renders the same document as the short
// canonical routes (/[locale]/privacy, /[locale]/terms) via LegalDocumentView.
export default async function LegalPage({ params }: { params: Params }) {
  const { locale, doc } = await params;
  if (!isLegalDoc(doc)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const site = getSiteConfig();
  const d = getLegalDocument(locale, doc, site);

  return (
    <LegalDocumentView doc={d} lastUpdated={t("lastUpdated", { date: site.legalLastUpdated })} />
  );
}
