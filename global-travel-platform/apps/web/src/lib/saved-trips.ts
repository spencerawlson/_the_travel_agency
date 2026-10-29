import { Preferences } from "@capacitor/preferences";

import type { CabinClass } from "@gtp/shared-types";

import {
  CABINS,
  CURRENCIES,
  toQuery,
  type SearchFormState,
} from "./search";

/**
 * A trip saved on this device, inside the app. A trip is a flight search, not
 * a booking: origin, destination, dates, passengers, cabin and currency. No
 * price is ever stored with a trip — prices are live partner data, and
 * showing a stored price later as if it were current would be misleading.
 * Re-running a saved trip re-queries live offers.
 */

export interface SavedTrip {
  id: string;
  from: string;
  fromLabel: string;
  to: string;
  toLabel: string;
  trip: "round_trip" | "one_way";
  depart: string;
  /** Present only for round trips. */
  returnDate?: string;
  adults: number;
  children: number;
  infants: number;
  cabin: CabinClass;
  currency: string;
  /** ISO timestamp of when the trip was saved. */
  savedAt: string;
}

export const SAVED_TRIPS_KEY = "farelune.savedTrips.v1";
export const LAST_SEARCH_KEY = "farelune.lastSearch.v1";
export const ATT_ASKED_KEY = "farelune.attAsked.v1";

const IATA = /^[A-Za-z]{3}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function intIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= min && value <= max ? value : null;
}

/** Validate untrusted stored data. Returns null for anything malformed. */
export function parseSavedTrip(value: unknown): SavedTrip | null {
  if (!isRecord(value)) return null;
  const from = typeof value.from === "string" ? value.from.toUpperCase() : "";
  const to = typeof value.to === "string" ? value.to.toUpperCase() : "";
  if (!IATA.test(from) || !IATA.test(to) || from === to) return null;
  const depart = typeof value.depart === "string" ? value.depart : "";
  if (!ISO_DATE.test(depart)) return null;
  const trip = value.trip === "one_way" ? "one_way" : value.trip === "round_trip" ? "round_trip" : null;
  if (!trip) return null;
  const returnDate = typeof value.returnDate === "string" ? value.returnDate : undefined;
  if (trip === "round_trip" && (!returnDate || !ISO_DATE.test(returnDate))) return null;
  if (trip === "one_way" && returnDate !== undefined) return null;
  const adults = intIn(value.adults, 1, 9);
  const children = intIn(value.children, 0, 9);
  const infants = intIn(value.infants, 0, 9);
  if (adults === null || children === null || infants === null) return null;
  if (infants > adults) return null;
  const cabin =
    typeof value.cabin === "string" && (CABINS as string[]).includes(value.cabin)
      ? (value.cabin as CabinClass)
      : null;
  if (!cabin) return null;
  const currency =
    typeof value.currency === "string" &&
    (CURRENCIES as readonly string[]).includes(value.currency.toUpperCase())
      ? value.currency.toUpperCase()
      : null;
  if (!currency) return null;
  if (typeof value.id !== "string" || value.id.length === 0) return null;
  if (typeof value.savedAt !== "string" || Number.isNaN(Date.parse(value.savedAt))) return null;
  return {
    id: value.id,
    from,
    fromLabel: typeof value.fromLabel === "string" ? value.fromLabel : from,
    to,
    toLabel: typeof value.toLabel === "string" ? value.toLabel : to,
    trip,
    depart,
    ...(returnDate ? { returnDate } : {}),
    adults,
    children,
    infants,
    cabin,
    currency,
    savedAt: value.savedAt,
  };
}

/** Build a saved trip from a search form. Null when the form is incomplete. */
export function tripFromForm(form: SearchFormState): SavedTrip | null {
  if (!form.origin || !form.destination) return null;
  const from = form.origin.iata.toUpperCase();
  const to = form.destination.iata.toUpperCase();
  if (!IATA.test(from) || !IATA.test(to) || from === to) return null;
  if (!ISO_DATE.test(form.departDate)) return null;
  if (form.tripType === "round_trip" && !ISO_DATE.test(form.returnDate)) return null;
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    fromLabel: form.origin.label || from,
    to,
    toLabel: form.destination.label || to,
    trip: form.tripType,
    depart: form.departDate,
    ...(form.tripType === "round_trip" ? { returnDate: form.returnDate } : {}),
    adults: form.adults,
    children: form.children,
    infants: form.infants,
    cabin: form.cabin,
    currency: form.currency,
    savedAt: new Date().toISOString(),
  };
}

export function tripToForm(trip: SavedTrip): SearchFormState {
  return {
    origin: { iata: trip.from, label: trip.fromLabel },
    destination: { iata: trip.to, label: trip.toLabel },
    tripType: trip.trip,
    departDate: trip.depart,
    returnDate: trip.returnDate ?? "",
    adults: trip.adults,
    children: trip.children,
    infants: trip.infants,
    cabin: trip.cabin,
    currency: trip.currency,
  };
}

/** Results path (no locale prefix) that re-runs this trip's search. */
export function tripToPath(trip: SavedTrip): string {
  const q = toQuery(tripToForm(trip));
  return `/flights?${new URLSearchParams(q).toString()}`;
}

/** Locale-prefixed results URL that re-runs this trip's search. */
export function tripToUrl(trip: SavedTrip, locale: string): string {
  return `/${locale}${tripToPath(trip)}`;
}

/** Short human label, e.g. "YUL → CDG · 2026-12-12 · return 2026-12-20". */
export function tripLabel(trip: SavedTrip): string {
  const dates =
    trip.trip === "round_trip" && trip.returnDate
      ? `${trip.depart} · return ${trip.returnDate}`
      : trip.depart;
  return `${trip.from} → ${trip.to} · ${dates}`;
}

function sameSearch(a: SavedTrip, b: SavedTrip): boolean {
  return (
    a.from === b.from &&
    a.to === b.to &&
    a.trip === b.trip &&
    a.depart === b.depart &&
    a.returnDate === b.returnDate &&
    a.adults === b.adults &&
    a.children === b.children &&
    a.infants === b.infants &&
    a.cabin === b.cabin &&
    a.currency === b.currency
  );
}

async function readTrips(key: string): Promise<SavedTrip[]> {
  try {
    const { value } = await Preferences.get({ key });
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseSavedTrip).filter((t): t is SavedTrip => t !== null);
  } catch {
    return [];
  }
}

export async function loadSavedTrips(): Promise<SavedTrip[]> {
  const trips = await readTrips(SAVED_TRIPS_KEY);
  return trips.sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/** Save a trip; returns false when an identical search is already saved. */
export async function saveTrip(trip: SavedTrip): Promise<boolean> {
  const trips = await loadSavedTrips();
  if (trips.some((t) => sameSearch(t, trip))) return false;
  await Preferences.set({ key: SAVED_TRIPS_KEY, value: JSON.stringify([trip, ...trips]) });
  return true;
}

export async function deleteTrip(id: string): Promise<void> {
  const trips = await loadSavedTrips();
  await Preferences.set({
    key: SAVED_TRIPS_KEY,
    value: JSON.stringify(trips.filter((t) => t.id !== id)),
  });
}

/** The most recent valid search, for the offline fallback page. */
export async function saveLastSearch(trip: SavedTrip): Promise<void> {
  await Preferences.set({ key: LAST_SEARCH_KEY, value: JSON.stringify(trip) });
}

export async function loadLastSearch(): Promise<SavedTrip | null> {
  try {
    const { value } = await Preferences.get({ key: LAST_SEARCH_KEY });
    if (!value) return null;
    return parseSavedTrip(JSON.parse(value));
  } catch {
    return null;
  }
}
