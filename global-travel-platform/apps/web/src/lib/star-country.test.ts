import { describe, expect, it } from "vitest";
import { getStarCountry, starCountryCount, starCountryText } from "./star-country";

describe("star country rotation", () => {
  it("has 52 countries in the rotation", () => {
    expect(starCountryCount()).toBe(52);
  });

  it("is deterministic: same date gives the same country", () => {
    const d = new Date(Date.UTC(2026, 9, 12, 12, 0, 0));
    expect(getStarCountry(d).slug).toBe(getStarCountry(d).slug);
  });

  it("advances exactly one country per week", () => {
    const monday = new Date(Date.UTC(2026, 0, 5, 12, 0, 0)); // epoch Monday
    const nextMonday = new Date(monday.getTime() + 7 * 24 * 3600 * 1000);
    const a = getStarCountry(monday).slug;
    const b = getStarCountry(nextMonday).slug;
    expect(a).not.toBe(b);
    // 52 weeks later we wrap back to the same country
    const yearLater = new Date(monday.getTime() + 52 * 7 * 24 * 3600 * 1000);
    expect(getStarCountry(yearLater).slug).toBe(a);
  });

  it("every country has complete en/fr content", () => {
    const seen = new Set<string>();
    const epoch = Date.UTC(2026, 0, 5);
    for (let w = 0; w < 52; w++) {
      const c = getStarCountry(new Date(epoch + w * 7 * 24 * 3600 * 1000));
      seen.add(c.slug);
      for (const loc of ["en", "fr"] as const) {
        const t = starCountryText(c, loc);
        expect(t.name.length).toBeGreaterThan(0);
        expect(t.tagline.length).toBeGreaterThan(0);
        expect(t.food.length).toBeGreaterThan(0);
        expect(t.culture.length).toBeGreaterThan(0);
        expect(t.sights.length).toBeGreaterThan(0);
        expect(t.knownFor.length).toBeGreaterThan(0);
      }
    }
    expect(seen.size).toBe(52);
  });
});
