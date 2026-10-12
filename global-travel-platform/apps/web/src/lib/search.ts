import type { CabinClass, FlightSearchRequest, Locale, TripType } from "@gtp/shared-types";

export const CABINS: CabinClass[] = ["economy", "premium_economy", "business", "first"];
export const CURRENCIES = ["CAD", "USD", "EUR", "GBP"] as const;
export const MAX_PASSENGERS = 9;
export const MAX_DAYS_AHEAD = 361;

export interface AirportChoice {
  iata: string;
  label: string; // e.g. "Montréal (YUL)"
}

export interface SearchFormState {
  tripType: TripType;
  origin: AirportChoice | null;
  destination: AirportChoice | null;
  departDate: string;
  returnDate: string;
  adults: number;
  children: number;
  infants: number;
  cabin: CabinClass;
  currency: string;
}

/** Error keys map to messages under `search.errors.*`. */
export type SearchErrorKey =
  | "originRequired"
  | "destinationRequired"
  | "sameAirport"
  | "departRequired"
  | "departPast"
  | "tooFar"
  | "returnRequired"
  | "returnBeforeDepart"
  | "tooManyPassengers"
  | "infantsExceedAdults"
  | "adultsRequired"
  | "currencyUnsupported";

export type SearchErrors = Partial<
  Record<
    "origin" | "destination" | "departDate" | "returnDate" | "passengers" | "currency",
    SearchErrorKey
  >
>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function todayIso(now: Date = new Date()): string {
  // Local calendar date of the traveller, not UTC.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function validateSearch(form: SearchFormState, today: string = todayIso()): SearchErrors {
  const errors: SearchErrors = {};
  if (!form.origin) errors.origin = "originRequired";
  if (!form.destination) errors.destination = "destinationRequired";
  if (form.origin && form.destination && form.origin.iata === form.destination.iata) {
    errors.destination = "sameAirport";
  }

  const latest = addDays(today, MAX_DAYS_AHEAD);
  if (!form.departDate || !isValidIsoDate(form.departDate)) {
    errors.departDate = "departRequired";
  } else if (form.departDate < today) {
    errors.departDate = "departPast";
  } else if (form.departDate > latest) {
    errors.departDate = "tooFar";
  }

  if (form.tripType === "round_trip") {
    if (!form.returnDate || !isValidIsoDate(form.returnDate)) {
      errors.returnDate = "returnRequired";
    } else if (form.departDate && form.returnDate < form.departDate) {
      errors.returnDate = "returnBeforeDepart";
    } else if (form.returnDate > latest) {
      errors.returnDate = "tooFar";
    }
  }

  if (form.adults < 1) errors.passengers = "adultsRequired";
  else if (form.adults + form.children + form.infants > MAX_PASSENGERS)
    errors.passengers = "tooManyPassengers";
  else if (form.infants > form.adults) errors.passengers = "infantsExceedAdults";

  if (!(CURRENCIES as readonly string[]).includes(form.currency)) {
    errors.currency = "currencyUnsupported";
  }
  return errors;
}

/** Serialise a valid form into URL query params for the results page. */
export function toQuery(form: SearchFormState): Record<string, string> {
  const q: Record<string, string> = {
    from: form.origin?.iata ?? "",
    fromLabel: form.origin?.label ?? "",
    to: form.destination?.iata ?? "",
    toLabel: form.destination?.label ?? "",
    trip: form.tripType,
    depart: form.departDate,
    adults: String(form.adults),
    children: String(form.children),
    infants: String(form.infants),
    cabin: form.cabin,
    currency: form.currency,
  };
  if (form.tripType === "round_trip") q.return = form.returnDate;
  return q;
}

function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(value ?? "", 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

const IATA = /^[A-Za-z]{3}$/;

/** Parse untrusted URL params back into form state (clamped and whitelisted). */
export function fromQuery(params: URLSearchParams): SearchFormState {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const trip = params.get("trip") === "one_way" ? "one_way" : "round_trip";
  const cabin = (CABINS as string[]).includes(params.get("cabin") ?? "")
    ? (params.get("cabin") as CabinClass)
    : "economy";
  const currency = (params.get("currency") ?? "CAD").toUpperCase();
  const label = (raw: string | null, iata: string) =>
    (raw ?? "").slice(0, 120) || iata.toUpperCase();
  return {
    tripType: trip,
    origin: IATA.test(from)
      ? { iata: from.toUpperCase(), label: label(params.get("fromLabel"), from) }
      : null,
    destination: IATA.test(to)
      ? { iata: to.toUpperCase(), label: label(params.get("toLabel"), to) }
      : null,
    departDate: params.get("depart") ?? "",
    returnDate: trip === "round_trip" ? (params.get("return") ?? "") : "",
    adults: intParam(params.get("adults"), 1, 0, 9),
    children: intParam(params.get("children"), 0, 0, 8),
    infants: intParam(params.get("infants"), 0, 0, 4),
    cabin,
    currency: (CURRENCIES as readonly string[]).includes(currency) ? currency : "CAD",
  };
}

export function toApiRequest(form: SearchFormState, locale: Locale): FlightSearchRequest {
  return {
    origin: form.origin?.iata ?? "",
    destination: form.destination?.iata ?? "",
    trip_type: form.tripType,
    depart_date: form.departDate,
    return_date: form.tripType === "round_trip" ? form.returnDate : null,
    adults: form.adults,
    children: form.children,
    infants: form.infants,
    cabin: form.cabin,
    currency: form.currency,
    locale,
  };
}

export function defaultForm(today: string = todayIso()): SearchFormState {
  return {
    tripType: "round_trip",
    origin: null,
    destination: null,
    departDate: addDays(today, 21),
    returnDate: addDays(today, 28),
    adults: 1,
    children: 0,
    infants: 0,
    cabin: "economy",
    currency: "CAD",
  };
}
