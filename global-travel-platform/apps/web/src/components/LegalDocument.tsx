import { TextWithEmails } from "@/components/EmailLink";
import type { LegalDocument } from "@/content/legal";

/**
 * Shared rendering for a legal document. Used by both the short canonical
 * routes (/[locale]/privacy, /[locale]/terms) and the legacy
 * /[locale]/legal/[doc] aliases, so the two URLs never drift apart.
 */
export function LegalDocumentView({
  doc,
  lastUpdated,
}: {
  doc: LegalDocument;
  lastUpdated: string;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold">{doc.title}</h1>
      <p className="mt-2 text-ink-muted">{doc.summary}</p>
      <p className="mt-1 text-sm text-ink-muted">{lastUpdated}</p>
      {doc.sections.map((section) => (
        <section key={section.heading} className="mt-8">
          <h2 className="font-display text-2xl font-semibold">{section.heading}</h2>
          {section.paragraphs.map((p) => (
            <p key={p.slice(0, 40)} className="mt-3 leading-relaxed">
              <TextWithEmails text={p} linkClassName="text-brand-600 underline" />
            </p>
          ))}
          {section.list && (
            <ul className="mt-3 list-disc space-y-2 pl-5">
              {section.list.map((item) => (
                <li key={item.slice(0, 40)}>
                  <TextWithEmails text={item} linkClassName="text-brand-600 underline" />
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </article>
  );
}
