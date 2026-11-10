import { describe, expect, it } from "vitest";
import { cloudflareScheme } from "./cloudflare";

describe("cloudflareScheme", () => {
  it("reads https from Cloudflare's CF-Visitor header", () => {
    expect(cloudflareScheme('{"scheme":"https"}')).toBe("https");
  });

  it("reads http as well (a real HTTP visitor stays HTTP)", () => {
    expect(cloudflareScheme('{"scheme":"http"}')).toBe("http");
  });

  it("returns null when the header is absent (local dev, no Cloudflare)", () => {
    expect(cloudflareScheme(null)).toBeNull();
  });

  it("returns null for a malformed header instead of throwing", () => {
    expect(cloudflareScheme("not-json")).toBeNull();
    expect(cloudflareScheme('{"scheme":"ftp"}')).toBeNull();
    expect(cloudflareScheme("{}")).toBeNull();
  });
});
