import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";
import { LEGAL_DOCS, getLegalDocument } from "../content/legal";
import type { SiteConfig } from "../lib/site";

function keys(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v as object, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

const site: SiteConfig = {
  name: "Test",
  legalEntity: "Test Inc.",
  contactEmail: "a@example.com",
  privacyEmail: "p@example.com",
  address: "Québec",
  privacyOfficer: "Officer",
  legalLastUpdated: "2030-01-01",
  partnerScript: false,
};

describe("translations", () => {
  it("English and French define exactly the same keys", () => {
    expect(keys(fr).sort()).toEqual(keys(en).sort());
  });

  it("no translation is empty", () => {
    for (const [name, messages] of Object.entries({ en, fr })) {
      for (const key of keys(messages)) {
        const value = key
          .split(".")
          .reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], messages);
        expect(String(value).trim(), `${name}:${key}`).not.toBe("");
      }
    }
  });

  it("every legal document exists in both languages with the same structure", () => {
    for (const partnerScript of [false, true]) {
      const cfg = { ...site, partnerScript };
      for (const doc of LEGAL_DOCS) {
        const e = getLegalDocument("en", doc, cfg);
        const f = getLegalDocument("fr", doc, cfg);
        expect(f.sections.length, `${doc} partner=${partnerScript}`).toBe(e.sections.length);
        expect(f.title).not.toBe("");
      }
    }
  });

  it("partner-script wording appears only when the script is enabled", () => {
    const off = JSON.stringify(getLegalDocument("en", "cookies", site));
    const on = JSON.stringify(getLegalDocument("en", "cookies", { ...site, partnerScript: true }));
    expect(off).not.toContain("Travelpayouts");
    expect(on).toContain("Travelpayouts");
    expect(on).toContain("fl_consent");
    expect(off).not.toContain("light/dark");
  });
});
