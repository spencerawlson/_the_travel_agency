/**
 * Legal pages (published; the draft notice was removed Oct 2026 for the
 * iOS submission). Configurable values (entity, emails, address) come from
 * SiteConfig (env vars).
 * Review checklist: docs/COMPLIANCE.md.
 */
import type { SiteConfig } from "@/lib/site";
import { en } from "./en";
import { fr } from "./fr";

export const LEGAL_DOCS = ["privacy", "terms", "affiliate-disclosure", "cookies"] as const;
export type LegalDoc = (typeof LEGAL_DOCS)[number];

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  list?: string[];
}

export interface LegalDocument {
  title: string;
  summary: string;
  sections: LegalSection[];
}

export type LegalContent = (site: SiteConfig) => Record<LegalDoc, LegalDocument>;

const BY_LOCALE: Record<string, LegalContent> = { en, fr };

export function getLegalDocument(locale: string, doc: LegalDoc, site: SiteConfig): LegalDocument {
  return (BY_LOCALE[locale] ?? en)(site)[doc];
}

export function isLegalDoc(value: string): value is LegalDoc {
  return (LEGAL_DOCS as readonly string[]).includes(value);
}
