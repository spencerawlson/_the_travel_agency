import { describe, expect, it } from "vitest";
import { getMetaPixelId, isPartnerHost } from "./meta";

describe("getMetaPixelId", () => {
  it("returns null when unset or empty", () => {
    expect(getMetaPixelId({})).toBeNull();
    expect(getMetaPixelId({ META_PIXEL_ID: "" })).toBeNull();
    expect(getMetaPixelId({ META_PIXEL_ID: "   " })).toBeNull();
  });

  it("returns a numeric ID, trimmed", () => {
    expect(getMetaPixelId({ META_PIXEL_ID: "123456789012345" })).toBe("123456789012345");
    expect(getMetaPixelId({ META_PIXEL_ID: " 987654321 " })).toBe("987654321");
  });

  it("rejects non-numeric values", () => {
    expect(getMetaPixelId({ META_PIXEL_ID: "abc123" })).toBeNull();
    expect(getMetaPixelId({ META_PIXEL_ID: "123-456" })).toBeNull();
  });
});

describe("isPartnerHost", () => {
  it("matches partner domains and their subdomains", () => {
    expect(isPartnerHost("www.aviasales.com")).toBe(true);
    expect(isPartnerHost("aviasales.com")).toBe(true);
    expect(isPartnerHost("www.kiwi.com")).toBe(true);
    expect(isPartnerHost("www.klook.com")).toBe(true);
  });

  it("does not match lookalikes or unrelated hosts", () => {
    expect(isPartnerHost("notaviasales.com")).toBe(false);
    expect(isPartnerHost("aviasales.com.evil.example")).toBe(false);
    expect(isPartnerHost("farelune.com")).toBe(false);
    expect(isPartnerHost("www.facebook.com")).toBe(false);
  });
});
