import data from "@/content/star-countries.json";

/**
 * "Country of the Week" — a self-rotating showcase on the homepage.
 *
 * Rotation is purely deterministic: the week index since a fixed Monday epoch,
 * modulo the number of countries. No cron, no admin action, no database —
 * every visitor sees the same country all week, and it changes on its own
 * every Monday. With 52 countries the cycle covers a full year.
 */

export interface StarCountryText {
  name: string;
  tagline: string;
  food: string;
  culture: string;
  sights: string;
  knownFor: string;
}

export interface StarCountry {
  slug: string;
  /** Gradient theme class suffix (see globals.css .theme-*). */
  theme: string;
  en: StarCountryText;
  fr: StarCountryText;
}

const COUNTRIES = data as StarCountry[];

const WEEK_MS = 7 * 24 * 3600 * 1000;
/** Monday 2026-01-05 UTC — weeks tick every Monday. */
const EPOCH = Date.UTC(2026, 0, 5);

export function getStarCountry(now: Date = new Date()): StarCountry {
  const weeks = Math.floor((now.getTime() - EPOCH) / WEEK_MS);
  const idx = ((weeks % COUNTRIES.length) + COUNTRIES.length) % COUNTRIES.length;
  const country = COUNTRIES[idx];
  if (!country) throw new Error("star-countries.json is empty");
  return country;
}

export function starCountryText(country: StarCountry, locale: string): StarCountryText {
  return locale === "fr" ? country.fr : country.en;
}

/** For tests: how many countries are in the rotation. */
export function starCountryCount(): number {
  return COUNTRIES.length;
}
