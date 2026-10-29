import { Share } from "@capacitor/share";

import { fromQuery } from "./search";
import { tripLabel, type SavedTrip } from "./saved-trips";

/**
 * Native share content built from the page the user is actually on — never
 * placeholder text. Flight searches share the real route and dates; a
 * destination page shares that destination; anything else shares the page
 * itself. No price is included: prices are live partner data and go stale.
 */

export interface ShareContent {
  title: string;
  text: string;
  url: string;
}

export function shareContentFor(location: URL, siteName: string): ShareContent {
  const path = location.pathname;
  const flights = /^\/[a-z]{2}\/flights\/?$/.test(path);
  if (flights) {
    const form = fromQuery(location.searchParams);
    if (form.origin && form.destination) {
      const trip: SavedTrip = {
        id: "",
        from: form.origin.iata,
        fromLabel: form.origin.label || form.origin.iata,
        to: form.destination.iata,
        toLabel: form.destination.label || form.destination.iata,
        trip: form.tripType,
        depart: form.departDate,
        ...(form.tripType === "round_trip" ? { returnDate: form.returnDate } : {}),
        adults: form.adults,
        children: form.children,
        infants: form.infants,
        cabin: form.cabin,
        currency: form.currency,
        savedAt: "",
      };
      return {
        title: `${siteName}: ${form.origin.iata} → ${form.destination.iata}`,
        text: `${siteName} — ${tripLabel(trip)}`,
        url: location.toString(),
      };
    }
  }
  const destination = path.match(/^\/[a-z]{2}\/destinations\/([^/]+)\/?$/);
  if (destination) {
    const slug = decodeURIComponent(destination[1] ?? "").replace(/-/g, " ");
    return {
      title: `${siteName}: ${slug}`,
      text: `${siteName} — ${slug}`,
      url: location.toString(),
    };
  }
  return {
    title: siteName,
    text: siteName,
    url: location.toString(),
  };
}

/** Opens the native share sheet. False when sharing is unavailable/cancelled. */
export async function shareCurrentPage(location: URL, siteName: string): Promise<boolean> {
  try {
    const content = shareContentFor(location, siteName);
    await Share.share({ title: content.title, text: content.text, url: content.url });
    return true;
  } catch {
    return false;
  }
}
