"use client";

import { useTranslations } from "next-intl";
import { useId, useMemo, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { requestFlight } from "@/lib/globe-events";
import { searchItems, type Searchable } from "@/lib/text-search";

export interface SearchableDestination extends Searchable {
  slug: string;
  name: string;
  country: string;
}

const MAX_RESULTS = 8;

/**
 * Type a city or country to jump to its destination page. Results are plain
 * links (Tab to them; Enter in the box opens the first). The collapsed "browse
 * all" list keeps every destination reachable without the globe or a search,
 * for keyboards, screen readers, browsers without WebGL, and search engines.
 */
export function DestinationSearch({ items }: { items: SearchableDestination[] }) {
  const t = useTranslations("destinations");
  const router = useRouter();
  const inputId = useId();
  const resultsId = useId();
  const [query, setQuery] = useState("");
  const matches = useMemo(() => searchItems(items, query), [items, query]);
  const shown = matches.slice(0, MAX_RESULTS);
  const searching = query.trim().length > 0;

  /** Let the globe fly the plane there (it then opens the page); else just go. */
  const go = (slug: string) => {
    if (!requestFlight(slug)) router.push(`/destinations/${slug}`);
  };

  return (
    <div className="mx-auto mt-8 max-w-xl">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (shown[0]) go(shown[0].slug);
        }}
      >
        <label htmlFor={inputId} className="block text-sm font-semibold">
          {t("searchLabel")}
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("searchPlaceholder")}
          autoComplete="off"
          aria-controls={resultsId}
          className="focus:ring-brand-100 mt-2 w-full rounded-full border border-line bg-surface-1 px-5 py-3 text-base shadow-sm focus:border-brand-500 focus:ring-2 focus:outline-none"
        />
      </form>

      <div id={resultsId}>
        <p aria-live="polite" className="sr-only">
          {searching ? t("searchCount", { count: matches.length }) : ""}
        </p>
        {searching &&
          (shown.length > 0 ? (
            <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-surface-1 shadow-sm ring-1 ring-line">
              {shown.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/destinations/${d.slug}`}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                      if (requestFlight(d.slug)) e.preventDefault();
                    }}
                    className="flex items-baseline justify-between gap-3 px-5 py-3 hover:bg-surface-2 focus-visible:bg-surface-2"
                  >
                    <span className="font-semibold">{d.name}</span>
                    <span className="text-sm text-ink-muted">{d.country}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">
              {t("searchNone", { query: query.trim() })}
            </p>
          ))}
      </div>

      <details className="mt-6 text-center">
        <summary className="cursor-pointer text-sm font-semibold text-brand-700 hover:underline">
          {t("browseAll", { count: items.length })}
        </summary>
        <ul className="mt-4 flex flex-wrap justify-center gap-2 text-left">
          {items.map((d) => (
            <li key={d.slug}>
              <Link
                href={`/destinations/${d.slug}`}
                className="inline-block rounded-full bg-surface-1 px-3 py-1.5 text-sm ring-1 ring-line hover:bg-surface-2"
              >
                {d.name}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
