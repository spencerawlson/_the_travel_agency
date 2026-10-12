/**
 * API contract types shared by the web app (and future clients).
 * Source of truth is the FastAPI OpenAPI schema at /api/openapi.json; keep in sync
 * (see docs/API.md). Decimal amounts are serialised as strings to avoid float error.
 */

export type Locale = "en" | "fr";
export type TripType = "one_way" | "round_trip";
export type CabinClass = "economy" | "premium_economy" | "business" | "first";
export type DisclaimerCode =
  "demo_data" | "cached_prices" | "prices_may_change" | "seller_responsible";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    request_id?: string | null;
  };
}

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country_code: string;
  country_name: string;
  timezone: string;
}

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  minor_units: number;
}

export interface DestinationLandmark {
  name: string;
  description: string;
}

export interface DestinationOfficialLink {
  label: string;
  url: string;
}

export interface Destination {
  slug: string;
  name: string;
  summary: string;
  description: string;
  highlights: string[];
  city: string;
  country_code: string;
  airport_iata: string;
  tags: string[];
  theme: string;
  latitude: number;
  longitude: number;
  timezone: string; // IANA
  best_months: number[]; // 1-12
  currency: string | null; // ISO 4217
  languages: string[]; // BCP 47 language codes
  /** Present when requested with ?origin=IATA. Approximate, for display only. */
  origin: string | null;
  distance_km: number | null;
  approx_flight_minutes: number | null;
  /** Travel-writer history of the destination (localised). */
  history: string | null;
  /** Travel-writer culture column (localised). */
  culture: string | null;
  /** Landmarks with their stories (localised). */
  landmarks: DestinationLandmark[];
  /** Official tourism websites. */
  official_links: DestinationOfficialLink[];
}

export interface FlightSearchRequest {
  origin: string;
  destination: string;
  trip_type: TripType;
  depart_date: string; // YYYY-MM-DD
  return_date: string | null;
  adults: number;
  children: number;
  infants: number;
  cabin: CabinClass;
  currency: string;
  locale: Locale;
}

export interface Money {
  amount: string;
  currency: string;
}

export interface FlightSegment {
  carrier_code: string;
  carrier_name: string;
  flight_number: string;
  origin: string;
  destination: string;
  depart_at: string; // ISO 8601 with offset (local time of the airport)
  arrive_at: string;
  duration_minutes: number;
}

export interface FlightSlice {
  segments: FlightSegment[];
  duration_minutes: number;
  stops: number;
}

export interface FlightOffer {
  id: string;
  provider_code: string;
  provider_name: string;
  is_demo: boolean;
  price: Money;
  cabin: CabinClass;
  outbound: FlightSlice;
  inbound: FlightSlice | null;
  seller_name: string;
  seller_type: "airline" | "agency" | "demo";
  expires_at: string;
  /** Codes: demo_fare, cached_fare, different_dates, economy_only, seller_on_partner. */
  notes: string[];
  /** "total" = whole party; "per_adult" = one adult (cached fares). */
  price_basis: "total" | "per_adult";
  /** False while partner referrals are switched off. */
  bookable: boolean;
}

export interface ProviderStatus {
  code: string;
  name: string;
  is_demo: boolean;
  status: "ok" | "error";
  error: string | null;
  result_count: number;
}

export interface FlightSearchResponse {
  search_id: string;
  is_demo: boolean;
  currency: string;
  origin: Airport;
  destination: Airport;
  offers: FlightOffer[];
  providers: ProviderStatus[];
  disclaimers: DisclaimerCode[];
}

export interface ReferralClickResponse {
  click_id: string;
  redirect_url: string;
  is_demo: boolean;
  provider_name: string;
  seller_name: string;
  notice: "demo_redirect" | "partner_redirect";
}

export interface Deal {
  destination_slug: string;
  destination_name: string;
  origin: string;
  destination: string;
  depart_date: string;
  return_date: string;
  price: Money;
  is_demo: boolean;
}

export interface DealsResponse {
  is_demo: boolean;
  origin: string;
  currency: string;
  deals: Deal[];
  disclaimers: DisclaimerCode[];
}

export interface Health {
  status: "ok" | "degraded";
  version: string;
  environment: string;
  checks: Record<string, string>;
  demo_mode: boolean;
  referrals_live_enabled: boolean;
}

// --- admin -------------------------------------------------------------------

export type AdminRole = "viewer" | "analyst" | "admin";

export interface AdminSession {
  user: { id: number; email: string; role: AdminRole; last_login_at: string | null };
  expires_at: string;
  csrf_token: string | null;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export interface AdminOverview {
  period_days: number;
  generated_at: string;
  totals: {
    searches: number;
    searches_demo: number;
    referral_clicks: number;
    redirected_clicks: number;
    approx_unique_daily_visitors: number;
    click_through_rate: number | null;
    click_to_commission_rate: number | null;
  };
  click_statuses: Record<string, number>;
  commissions: { status: string; currency: string; count: number; amount: string }[];
  top_destinations: { iata: string; city: string; searches: number }[];
  popular_routes: { origin: string; destination: string; searches: number }[];
  trend: { date: string; searches: number; clicks: number }[];
  providers: {
    code: string;
    name: string;
    status: string;
    is_demo: boolean;
    agreement_verified: boolean;
    clicks: number;
    errors: number;
  }[];
  errors: {
    total: number;
    by_code: { source: string; code: string; count: number }[];
    recent: {
      created_at: string;
      source: string;
      code: string;
      message: string;
      path: string | null;
      provider_code: string | null;
    }[];
  };
  system: {
    database: string;
    redis: string;
    enabled_providers: string[];
    demo_mode: boolean;
    referrals_live_enabled: boolean;
    environment: string;
    version: string;
  };
}

export interface SearchEvent {
  id: string;
  created_at: string;
  origin_iata: string;
  destination_iata: string;
  trip_type: TripType;
  depart_date: string;
  return_date: string | null;
  adults: number;
  children: number;
  infants: number;
  cabin: CabinClass;
  currency: string;
  locale: string;
  result_count: number;
  status: string;
  latency_ms: number;
  is_demo: boolean;
}

export interface ReferralEvent {
  id: string;
  created_at: string;
  search_event_id: string | null;
  provider_code: string;
  offer_id: string;
  origin_iata: string;
  destination_iata: string;
  price_amount: string | null;
  price_currency: string | null;
  is_demo: boolean;
  redirect_host: string | null;
  status: string;
  locale: string;
}

export type CommissionStatus = "estimated" | "pending" | "approved" | "rejected" | "paid";

export interface Commission {
  id: string;
  provider_code: string;
  referral_click_id: string | null;
  external_reference: string;
  status: CommissionStatus;
  amount: string;
  currency: string;
  booking_date: string | null;
  period_start: string | null;
  period_end: string | null;
  reported_at: string;
  source: string;
}

export interface CommissionPage extends Page<Commission> {
  totals: { status: CommissionStatus; currency: string; count: number; amount: string }[];
}
