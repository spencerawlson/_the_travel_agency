import { describe, expect, it } from "vitest";
import {
  addDays,
  defaultForm,
  fromQuery,
  type SearchFormState,
  toApiRequest,
  toQuery,
  validateSearch,
} from "./search";

const TODAY = "2030-03-10";
const YUL = { iata: "YUL", label: "Montréal (YUL)" };
const CDG = { iata: "CDG", label: "Paris (CDG)" };

function form(overrides: Partial<SearchFormState> = {}): SearchFormState {
  return { ...defaultForm(TODAY), origin: YUL, destination: CDG, ...overrides };
}

describe("validateSearch", () => {
  it("accepts a valid round trip", () => {
    expect(validateSearch(form(), TODAY)).toEqual({});
  });

  it("requires airports chosen from the list", () => {
    expect(validateSearch(form({ origin: null, destination: null }), TODAY)).toMatchObject({
      origin: "originRequired",
      destination: "destinationRequired",
    });
  });

  it("rejects identical origin and destination", () => {
    expect(validateSearch(form({ destination: YUL }), TODAY).destination).toBe("sameAirport");
  });

  it("validates dates", () => {
    expect(validateSearch(form({ departDate: "2030-03-09" }), TODAY).departDate).toBe("departPast");
    expect(validateSearch(form({ departDate: "" }), TODAY).departDate).toBe("departRequired");
    expect(validateSearch(form({ departDate: "2030-02-30" }), TODAY).departDate).toBe(
      "departRequired",
    );
    expect(
      validateSearch(
        form({ departDate: addDays(TODAY, 400), returnDate: addDays(TODAY, 401) }),
        TODAY,
      ),
    ).toMatchObject({ departDate: "tooFar" });
    expect(
      validateSearch(form({ departDate: "2030-04-10", returnDate: "2030-04-01" }), TODAY)
        .returnDate,
    ).toBe("returnBeforeDepart");
    expect(validateSearch(form({ returnDate: "" }), TODAY).returnDate).toBe("returnRequired");
  });

  it("does not require a return date for one-way trips", () => {
    expect(validateSearch(form({ tripType: "one_way", returnDate: "" }), TODAY)).toEqual({});
  });

  it("enforces passenger rules", () => {
    expect(validateSearch(form({ adults: 0 }), TODAY).passengers).toBe("adultsRequired");
    expect(validateSearch(form({ adults: 5, children: 5 }), TODAY).passengers).toBe(
      "tooManyPassengers",
    );
    expect(validateSearch(form({ adults: 1, infants: 2 }), TODAY).passengers).toBe(
      "infantsExceedAdults",
    );
  });

  it("rejects unsupported currencies", () => {
    expect(validateSearch(form({ currency: "JPY" }), TODAY).currency).toBe("currencyUnsupported");
  });
});

describe("query round-trip", () => {
  it("serialises and parses back the same search", () => {
    const original = form({ adults: 2, children: 1, cabin: "business", currency: "EUR" });
    const parsed = fromQuery(new URLSearchParams(toQuery(original)));
    expect(parsed).toEqual(original);
  });

  it("sanitises hostile or malformed params", () => {
    const parsed = fromQuery(
      new URLSearchParams({
        from: "<script>",
        to: "cdg",
        adults: "999",
        cabin: "spaceship",
        currency: "XXX",
        trip: "teleport",
      }),
    );
    expect(parsed.origin).toBeNull();
    expect(parsed.destination).toEqual({ iata: "CDG", label: "CDG" });
    expect(parsed.adults).toBe(9);
    expect(parsed.cabin).toBe("economy");
    expect(parsed.currency).toBe("CAD");
    expect(parsed.tripType).toBe("round_trip");
  });

  it("builds the API payload", () => {
    const req = toApiRequest(form({ tripType: "one_way" }), "fr");
    expect(req).toMatchObject({
      origin: "YUL",
      destination: "CDG",
      return_date: null,
      locale: "fr",
    });
  });
});
