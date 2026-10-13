import { describe, expect, it } from "vitest";
import { localeAlternates } from "./seo";

describe("localeAlternates", () => {
  it("gives each page its own canonical and matching language alternates", () => {
    const a = localeAlternates("fr", "/destinations");
    expect(a?.canonical).toBe("https://farelune.com/fr/destinations");
    expect(a?.languages).toEqual({
      en: "https://farelune.com/en/destinations",
      fr: "https://farelune.com/fr/destinations",
      "x-default": "https://farelune.com/en/destinations",
    });
  });

  it("handles the home page", () => {
    expect(localeAlternates("en", "")?.canonical).toBe("https://farelune.com/en");
  });
});
