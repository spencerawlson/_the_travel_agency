import { describe, expect, it } from "vitest";
import { globeQuality } from "./globe-quality";

describe("globeQuality", () => {
  it("draws phones at 1x with fewer dots and a 30 fps idle spin", () => {
    expect(globeQuality(true, 3)).toEqual({ dpr: 1, mapSamples: 10000, frameInterval: 2 });
  });
  it("keeps larger screens sharp, capped at 2x", () => {
    expect(globeQuality(false, 3)).toEqual({ dpr: 2, mapSamples: 16000, frameInterval: 1 });
    expect(globeQuality(false, 1)).toMatchObject({ dpr: 1 });
  });
});
