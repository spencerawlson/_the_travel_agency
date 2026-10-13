/** Lower-case and strip accents, so "Québec", "quebec" and "QUEBEC" all match. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

export interface Searchable {
  /** Pre-folded text to match against (names, countries, in both languages). */
  keywords: string;
}

/** Items whose keywords contain every word of the query (any order). */
export function searchItems<T extends Searchable>(items: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return items.filter((it) => words.every((w) => it.keywords.includes(w)));
}
