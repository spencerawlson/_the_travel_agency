import { describe, expect, it } from "vitest";

import { shareContentFor } from "./app-share";

describe("shareContentFor", () => {
  it("shares a real flight search, route and dates, with no price", () => {
    const url = new URL(
      "https://farelune.com/en/flights?from=YUL&fromLabel=Montr%C3%A9al&to=CDG&toLabel=Paris&trip=round_trip&depart=2026-12-12&return=2026-12-20&adults=2&children=0&infants=0&cabin=economy&currency=CAD",
    );
    const content = shareContentFor(url, "Farelune");
    expect(content.title).toBe("Farelune: YUL → CDG");
    expect(content.text).toBe("Farelune — YUL → CDG · 2026-12-12 · return 2026-12-20");
    expect(content.url).toBe(url.toString());
  });

  it("falls back to the page itself when the search is incomplete", () => {
    const url = new URL("https://farelune.com/en/flights");
    const content = shareContentFor(url, "Farelune");
    expect(content.url).toBe(url.toString());
    expect(content.text).toBe("Farelune");
  });

  it("shares a destination page by slug", () => {
    const url = new URL("https://farelune.com/en/destinations/paris");
    const content = shareContentFor(url, "Farelune");
    expect(content.title).toBe("Farelune: paris");
    expect(content.url).toBe(url.toString());
  });

  it("shares any other page as itself", () => {
    const url = new URL("https://farelune.com/en/deals");
    const content = shareContentFor(url, "Farelune");
    expect(content.title).toBe("Farelune");
    expect(content.url).toBe(url.toString());
  });
});
