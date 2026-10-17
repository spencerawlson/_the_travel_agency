import { describe, expect, it } from "vitest";
import { isAppUserAgent } from "./app-shell";

describe("isAppUserAgent", () => {
  it("recognises the token the native apps append", () => {
    expect(
      isAppUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FareluneApp/1.0",
      ),
    ).toBe(true);
    expect(
      isAppUserAgent(
        "Mozilla/5.0 (Linux; Android 15; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0.0.0 Mobile Safari/537.36 FareluneApp/1.0",
      ),
    ).toBe(true);
  });

  it("treats browsers as the website", () => {
    expect(
      isAppUserAgent(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(isAppUserAgent("NotFareluneApp/1.0")).toBe(false);
    expect(isAppUserAgent("")).toBe(false);
    expect(isAppUserAgent(null)).toBe(false);
  });
});
