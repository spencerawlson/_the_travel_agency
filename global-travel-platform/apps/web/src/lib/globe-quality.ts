/**
 * Rendering budget for the WebGL globes. On phone-sized screens the globe is
 * drawn at 1x pixel density with fewer map dots, and the idle spin is redrawn
 * every other frame (~30 fps). Measured at 4x CPU throttling with software
 * WebGL (what Lighthouse mobile simulates): 60 frames took ~12.9 s at 2x and
 * ~1.5 s at 1x, with no visible difference at that size. Larger screens keep
 * the sharp version.
 */
export interface GlobeQuality {
  dpr: number;
  mapSamples: number;
  /** Redraw the idle spin every Nth animation frame. */
  frameInterval: number;
}

export function globeQuality(
  small = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches,
  devicePixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
): GlobeQuality {
  return small
    ? { dpr: 1, mapSamples: 10000, frameInterval: 2 }
    : { dpr: Math.min(devicePixelRatio, 2), mapSamples: 16000, frameInterval: 1 };
}
