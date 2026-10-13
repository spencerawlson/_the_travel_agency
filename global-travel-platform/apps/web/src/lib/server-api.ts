import "server-only";
import { cookies } from "next/headers";
import type { Destination, Health } from "@gtp/shared-types";
import { IATA_ORIGIN, type OriginAirport } from "@/content/origin-airports";
import { apiInternalUrl } from "./site";

/** Cookie set by the middleware from the visitor's country (or their own choice). */
const ORIGIN_COOKIE = "gtp_origin";
const FALLBACK_IATA = "YUL";

/**
 * The visitor's origin airport for flight-distance estimates. Reads the
 * `gtp_origin` cookie (set from Cloudflare's country header, overridable by
 * the search form). Falls back to YUL when unknown.
 */
export async function getOrigin(): Promise<OriginAirport> {
  const fallback = {
    iata: FALLBACK_IATA,
    city: "Montreal",
    cityFr: "Montréal",
    latitude: 45.4678,
    longitude: -73.7423,
  };
  try {
    const iata = (await cookies()).get(ORIGIN_COOKIE)?.value?.toUpperCase();
    if (iata && IATA_ORIGIN[iata]) return IATA_ORIGIN[iata];
  } catch {
    // cookies() unavailable (e.g. sitemap prerender) — fall through
  }
  return fallback;
}

/** City name of the visitor's origin in the page locale. */
export function originCity(origin: OriginAirport, locale: string): string {
  return locale === "fr" ? origin.cityFr : origin.city;
}

/** Server-side GET against FastAPI. Only for unthrottled, cacheable reference data;
 * user-driven calls (search, referrals, deals) go through the browser so rate
 * limits apply per visitor, not per web server. */
async function apiGet<T>(path: string, revalidate = 60): Promise<T | null> {
  try {
    const res = await fetch(`${apiInternalUrl()}${path}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function getHealth(): Promise<Health | null> {
  return apiGet<Health>("/api/v1/health", 30);
}

/** Fails closed: if the API can't be reached we still show the demo banner. */
export async function isDemoMode(): Promise<boolean> {
  const health = await getHealth();
  return health?.demo_mode ?? true;
}

/** Destinations with approximate flight times from the visitor's origin airport. */
export async function getDestinations(locale: string): Promise<Destination[]> {
  const origin = await getOrigin();
  return (
    (await apiGet<Destination[]>(
      `/api/v1/destinations?locale=${locale}&origin=${origin.iata}`,
      300,
    )) ?? []
  );
}

export async function getDestination(slug: string, locale: string): Promise<Destination | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const origin = await getOrigin();
  return apiGet<Destination>(
    `/api/v1/destinations/${slug}?locale=${locale}&origin=${origin.iata}`,
    300,
  );
}
