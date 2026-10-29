import { describe, expect, it } from "vitest";

import {
  parseSavedTrip,
  tripFromForm,
  tripLabel,
  tripToForm,
  tripToUrl,
  type SavedTrip,
} from "./saved-trips";
import type { SearchFormState } from "./search";

const FORM: SearchFormState = {
  origin: { iata: "YUL", label: "Montréal (YUL)" },
  destination: { iata: "CDG", label: "Paris (CDG)" },
  tripType: "round_trip",
  departDate: "2026-12-12",
  returnDate: "2026-12-20",
  adults: 2,
  children: 1,
  infants: 0,
  cabin: "economy",
  currency: "CAD",
};

describe("tripFromForm", () => {
  it("builds a trip from a complete form", () => {
    const trip = tripFromForm(FORM);
    expect(trip).not.toBeNull();
    expect(trip?.from).toBe("YUL");
    expect(trip?.to).toBe("CDG");
    expect(trip?.returnDate).toBe("2026-12-20");
  });

  it("returns null for an incomplete form", () => {
    expect(tripFromForm({ ...FORM, origin: null })).toBeNull();
    expect(tripFromForm({ ...FORM, departDate: "not-a-date" })).toBeNull();
    expect(tripFromForm({ ...FORM, destination: { iata: "YUL", label: "same" } })).toBeNull();
  });

  it("omits returnDate for one-way trips", () => {
    const trip = tripFromForm({ ...FORM, tripType: "one_way", returnDate: "" });
    expect(trip?.trip).toBe("one_way");
    expect(trip?.returnDate).toBeUndefined();
  });
});

describe("tripToUrl", () => {
  it("round-trips through the results URL", () => {
    const trip = tripFromForm(FORM);
    expect(trip).not.toBeNull();
    if (!trip) return;
    const url = tripToUrl(trip, "en");
    expect(url.startsWith("/en/flights?")).toBe(true);
    const q = new URLSearchParams(url.split("?")[1]);
    expect(q.get("from")).toBe("YUL");
    expect(q.get("to")).toBe("CDG");
    expect(q.get("depart")).toBe("2026-12-12");
    expect(q.get("return")).toBe("2026-12-20");
    expect(q.get("cabin")).toBe("economy");
  });
});

describe("tripToForm", () => {
  it("restores the form a trip was saved from", () => {
    const trip = tripFromForm(FORM);
    expect(trip).not.toBeNull();
    if (!trip) return;
    const form = tripToForm(trip);
    expect(form.origin?.iata).toBe("YUL");
    expect(form.destination?.iata).toBe("CDG");
    expect(form.departDate).toBe("2026-12-12");
  });
});

describe("tripLabel", () => {
  it("labels round trips with both dates and one-way with one", () => {
    const round = tripFromForm(FORM);
    expect(round && tripLabel(round)).toBe("YUL → CDG · 2026-12-12 · return 2026-12-20");
    const oneWay = tripFromForm({ ...FORM, tripType: "one_way", returnDate: "" });
    expect(oneWay && tripLabel(oneWay)).toBe("YUL → CDG · 2026-12-12");
  });
});

describe("parseSavedTrip", () => {
  const base: SavedTrip = {
    id: "abc",
    from: "YUL",
    fromLabel: "Montréal (YUL)",
    to: "CDG",
    toLabel: "Paris (CDG)",
    trip: "round_trip",
    depart: "2026-12-12",
    returnDate: "2026-12-20",
    adults: 2,
    children: 1,
    infants: 0,
    cabin: "economy",
    currency: "CAD",
    savedAt: "2026-10-28T00:00:00.000Z",
  };

  it("accepts a valid stored trip and normalises codes", () => {
    const parsed = parseSavedTrip({ ...base, from: "yul", currency: "cad" });
    expect(parsed?.from).toBe("YUL");
    expect(parsed?.currency).toBe("CAD");
  });

  it("rejects malformed stored trips instead of crashing", () => {
    expect(parseSavedTrip(null)).toBeNull();
    expect(parseSavedTrip({ ...base, from: "YU" })).toBeNull();
    expect(parseSavedTrip({ ...base, from: "YUL", to: "YUL" })).toBeNull();
    expect(parseSavedTrip({ ...base, depart: "12/12/2026" })).toBeNull();
    expect(parseSavedTrip({ ...base, trip: "round_trip", returnDate: undefined })).toBeNull();
    expect(parseSavedTrip({ ...base, cabin: "luxury" })).toBeNull();
    expect(parseSavedTrip({ ...base, infants: 3, adults: 2 })).toBeNull();
    expect(parseSavedTrip({ ...base, currency: "BTC" })).toBeNull();
    expect(parseSavedTrip({ ...base, id: "" })).toBeNull();
    expect(parseSavedTrip({ ...base, savedAt: "yesterday" })).toBeNull();
  });
});
