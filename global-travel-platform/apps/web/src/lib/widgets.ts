/**
 * Travelpayouts brand widgets (Klook activities, Kiwi.com live flight search,
 * AirHelp flight-delay compensation check).
 * OFF unless TRAVELPAYOUTS_SCRIPT_ID (the project id, `trs`) and
 * TRAVELPAYOUTS_MARKER (the partner id, `shmarker`) are set. Like the Drive
 * script they only load after the visitor accepts partner cookies.
 *
 * URLs are built here from fixed campaign/promo ids and validated values, so no
 * visitor input reaches a third-party script URL unchecked.
 */

const ID_RE = /^\d{3,12}$/;
const IATA_RE = /^[A-Z]{3}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;

/** Hosts the widgets need, by CSP directive. */
export const WIDGET_CSP = {
  script: ["tpemd.com", "tpo.gg", "widgets.kiwi.com", "cdn.klook.com"],
  frame: ["widgets.kiwi.com", "affiliate.klook.com", "static.airhelp.com"],
  connect: ["tpo.gg", "brand.travelpayouts.com"],
  img: ["tpemd.com", "tpemb.com"],
} as const;

export interface WidgetIds {
  trs: string;
  marker: string;
}

export function getWidgetIds(
  env: Record<string, string | undefined> = process.env,
): WidgetIds | null {
  const trs = env.TRAVELPAYOUTS_SCRIPT_ID?.trim() ?? "";
  const marker = env.TRAVELPAYOUTS_MARKER?.trim() ?? "";
  return ID_RE.test(trs) && ID_RE.test(marker) ? { trs, marker } : null;
}

function url(ids: WidgetIds, params: Record<string, string>): string {
  const q = new URLSearchParams({ trs: ids.trs, shmarker: ids.marker, ...params });
  return `https://tpemd.com/content?${q.toString()}`;
}

/** Klook "things to do" cards (campaign 137). City 2 = Hong Kong. */
export function klookWidgetUrl(ids: WidgetIds, locale: string): string {
  return url(ids, {
    currency: "USD",
    locale: locale === "fr" ? "fr" : "en-US",
    city_id: "2",
    category: "4",
    amount: "3",
    powered_by: "true",
    campaign_id: "137",
    promo_id: "4497",
  });
}

export interface KiwiSearch {
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  currency: string;
}

/** Kiwi.com search + live results (campaign 111), pre-filled with the search. */
export function kiwiWidgetUrl(ids: WidgetIds, locale: string, s: KiwiSearch): string | null {
  if (!IATA_RE.test(s.origin) || !IATA_RE.test(s.destination) || !DATE_RE.test(s.departDate)) {
    return null;
  }
  const params: Record<string, string> = {
    currency: CURRENCY_RE.test(s.currency) ? s.currency.toLowerCase() : "usd",
    locale: locale === "fr" ? "fr" : "en",
    powered_by: "true",
    limit: "4",
    primary_color: "1D6FD8",
    results_background_color: "FFFFFF",
    form_background_color: "FFFFFF",
    from_name: s.origin,
    to_name: s.destination,
    departure: s.departDate,
    campaign_id: "111",
    promo_id: "3411",
  };
  if (s.returnDate && DATE_RE.test(s.returnDate)) params.return = s.returnDate;
  return url(ids, params);
}

/** AirHelp delay/cancellation compensation checker (campaign 120). */
export function airhelpWidgetUrl(ids: WidgetIds, locale: string): string {
  return url(ids, {
    lang: locale === "fr" ? "fr" : "en",
    powered_by: "true",
    campaign_id: "120",
    promo_id: "8679",
  });
}
