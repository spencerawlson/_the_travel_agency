import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import { siteUrl } from "./site";

/**
 * Canonical URL + hreflang alternates for a locale-prefixed page.
 * `path` is the part after the locale ("" for home, "/destinations", ...).
 * x-default points at English, the fallback for unmatched languages.
 */
export function localeAlternates(locale: string, path: string): Metadata["alternates"] {
  const base = siteUrl();
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = `${base}/${l}${path}`;
  languages["x-default"] = `${base}/${routing.defaultLocale}${path}`;
  return { canonical: `${base}/${locale}${path}`, languages };
}

/** Title/description plus matching canonical, hreflang and social tags for a page. */
export function pageMetadata(
  locale: string,
  path: string,
  { title, description }: { title?: string; description?: string },
): Metadata {
  const url = `${siteUrl()}/${locale}${path}`;
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    alternates: localeAlternates(locale, path),
    openGraph: {
      url,
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
    },
  };
}
