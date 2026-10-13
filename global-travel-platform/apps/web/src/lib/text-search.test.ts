import { describe, expect, it } from "vitest";
import { fold, searchItems } from "./text-search";

const items = [
  { slug: "lisbon", keywords: fold("Lisbon Lisbonne Portugal") },
  { slug: "quebec", keywords: fold("Québec City Ville de Québec Canada") },
  { slug: "tokyo", keywords: fold("Tokyo Japan Japon") },
];

describe("searchItems", () => {
  it("ignores accents and case", () => {
    expect(searchItems(items, "QUEBEC").map((i) => i.slug)).toEqual(["quebec"]);
    expect(searchItems(items, "québ").map((i) => i.slug)).toEqual(["quebec"]);
  });

  it("matches country names in either language and partial words", () => {
    expect(searchItems(items, "japon").map((i) => i.slug)).toEqual(["tokyo"]);
    expect(searchItems(items, "port").map((i) => i.slug)).toEqual(["lisbon"]);
  });

  it("requires every word and returns nothing for an empty query", () => {
    expect(searchItems(items, "lisbon japan")).toEqual([]);
    expect(searchItems(items, "   ")).toEqual([]);
  });
});
