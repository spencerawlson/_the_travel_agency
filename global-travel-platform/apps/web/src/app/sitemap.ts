import type { MetadataRoute } from "next";
import { getDestinations } from "@/lib/server-api";
import { routing } from "@/i18n/routing";
import { siteUrl } from "@/lib/site";

/** Static routes that should be indexed (locale-prefixed). */
const STATIC_ROUTES = ["", "/destinations", "/deals", "/about", "/contact"];

/**
 * Sitemap for search engines. Destination URLs are the SEO crown jewels —
 * each carries unique long-form editorial content (history, culture,
 * landmarks), so every locale variant is listed with a weekly change
 * frequency. If the API is unreachable at build time, static routes still
 * ship.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales) {
    for (const route of STATIC_ROUTES) {
      entries.push({
        url: `${base}/${locale}${route}`,
        lastModified: now,
        changeFrequency: route === "" ? "daily" : "weekly",
        priority: route === "" ? 1 : route === "/destinations" ? 0.9 : 0.6,
      });
    }
    const destinations = await getDestinations(locale).catch(() => []);
    for (const d of destinations ?? []) {
      entries.push({
        url: `${base}/${locale}/destinations/${d.slug}`,
        lastModified: now,
        changeFrequency: "weekly",
        priority: 0.8,
      });
    }
  }

  return entries;
}
