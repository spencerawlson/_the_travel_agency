import "server-only";
import type { Destination, Health } from "@gtp/shared-types";
import { apiInternalUrl } from "./site";

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

/** Destinations with approximate flight times from the home hub (YUL). */
export async function getDestinations(locale: string): Promise<Destination[]> {
  return (
    (await apiGet<Destination[]>(`/api/v1/destinations?locale=${locale}&origin=YUL`, 300)) ?? []
  );
}

export async function getDestination(slug: string, locale: string): Promise<Destination | null> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
  return apiGet<Destination>(`/api/v1/destinations/${slug}?locale=${locale}&origin=YUL`, 300);
}
