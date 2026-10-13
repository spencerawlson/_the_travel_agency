import "server-only";
import { cookies, headers } from "next/headers";
import type { Destination, Health } from "@gtp/shared-types";
import { COUNTRY_ORIGIN, IATA_ORIGIN, type OriginAirport } from "@/content/origin-airports";
import { apiInternalUrl } from "./site";

/** Cookie set by the middleware from the visitor's country (or their own choice). */
const ORIGIN_COOKIE = "gtp_origin";
/**
 * The visitor's origin airport for flight-distance estimates, from the
 * `gtp_origin` cookie (set from Cloudflare's country header, or chosen in the
 * search form). Null when unknown: no city is assumed for a worldwide audience.
 */
export async function getOrigin(): Promise<OriginAirport | null> {
  try {
    const iata = (await cookies()).get(ORIGIN_COOKIE)?.value?.toUpperCase();
    if (iata && IATA_ORIGIN[iata]) return IATA_ORIGIN[iata];
    // First visit: the middleware only sets the cookie on this response, so read
    // Cloudflare's country header directly (same mapping as src/proxy.ts).
    const country = (await headers()).get("cf-ipcountry")?.toUpperCase();
    if (country && COUNTRY_ORIGIN[country]) return COUNTRY_ORIGIN[country];
  } catch {
    // cookies() unavailable (e.g. sitemap prerender): treat as unknown.
  }
  return null;
}

/** City name of the visitor's origin in the page locale. */
export function originCity(origin: OriginAirport | null, locale: string): string | null {
  if (!origin) return null;
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
      `/api/v1/destinations?locale=${locale}${origin ? `&origin=${origin.iata}` : ""}`,
      300,
    )) ?? []
  );
}

export async function getDestination(slug: string, locale: string): Promise<Destination | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  const origin = await getOrigin();
  return apiGet<Destination>(
    `/api/v1/destinations/${slug}?locale=${locale}${origin ? `&origin=${origin.iata}` : ""}`,
    300,
  );
}
