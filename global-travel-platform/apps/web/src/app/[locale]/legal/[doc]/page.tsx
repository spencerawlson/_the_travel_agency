import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getLegalDocument, isLegalDoc } from "@/content/legal";
import { getSiteConfig } from "@/lib/site";

type Params = Promise<{ locale: string; doc: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, doc } = await params;
  if (!isLegalDoc(doc)) return {};
  const d = getLegalDocument(locale, doc, getSiteConfig());
  return { title: d.title, description: d.summary };
}

export default async function LegalPage({ params }: { params: Params }) {
  const { locale, doc } = await params;
  if (!isLegalDoc(doc)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  const site = getSiteConfig();
  const d = getLegalDocument(locale, doc, site);

  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <p
        role="note"
        className="mb-8 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm font-medium text-amber-950"
      >
        {t("draftBanner")}
      </p>
      <h1 className="font-display text-4xl font-semibold">{d.title}</h1>
      <p className="mt-2 text-ink-muted">{d.summary}</p>
      <p className="mt-1 text-sm text-ink-muted">
        {t("lastUpdated", { date: site.legalLastUpdated })}
      </p>
      {d.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="font-display text-2xl font-semibold">{section.heading}</h2>
          {section.paragraphs.map((p) => (
            <p key={p.slice(0, 40)} className="mt-3 leading-relaxed">
              {p}
            </p>
          ))}
          {section.list && (
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {section.list.map((item) => (
                <li key={item.slice(0, 40)}>{item}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
