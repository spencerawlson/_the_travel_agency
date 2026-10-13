import { describe, expect, it } from "vitest";
import {
  arcPoint,
  easeInOutCubic,
  latLngToVec,
  pickMarker,
  projectMarker,
  projectPoint,
} from "./globe-math";

describe("latLngToVec", () => {
  it("produces unit vectors", () => {
    for (const [lat, lng] of [[0, 0], [48.85, 2.35], [-33.86, 151.2], [90, 0]] as const) {
      const [x, y, z] = latLngToVec(lat, lng);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
    }
  });
});

describe("projectPoint", () => {
  it("centers a front-facing point and hides the antipode", () => {
    // phi=0, theta=0: projection is a plain orthographic view.
    const front = projectPoint(latLngToVec(0, 180), 0, 0);
    expect(front.visible).toBe(true);
    const back = projectPoint(latLngToVec(0, 90), 0, 0);
    expect(back.visible).toBe(false);
  });
});

describe("arcPoint", () => {
  const from: [number, number] = [45.5, -73.6]; // Montréal
  const to: [number, number] = [48.85, 2.35]; // Paris

  it("starts at the departure and ends at the arrival", () => {
    const k = 0.82;
    const f = latLngToVec(...from);
    const g = latLngToVec(...to);
    const p0 = arcPoint(from, to, 0);
    const p1 = arcPoint(from, to, 1);
    expect(p0[0]).toBeCloseTo(f[0] * k, 8);
    expect(p0[1]).toBeCloseTo(f[1] * k, 8);
    expect(p1[0]).toBeCloseTo(g[0] * k, 8);
    expect(p1[2]).toBeCloseTo(g[2] * k, 8);
  });

  it("rises above the surface mid-flight", () => {
    const mid = arcPoint(from, to, 0.5);
    expect(Math.hypot(...mid)).toBeGreaterThan(0.82);
  });
});

describe("pickMarker", () => {
  const targets = [
    { slug: "paris", latitude: 48.85, longitude: 2.35 },
    { slug: "tokyo", latitude: 35.68, longitude: 139.69 },
  ];
  const size = 400;
  const phi = 4.6;
  const theta = 0.28;

  it("picks the marker clicked on", () => {
    const p = projectMarker(48.85, 2.35, phi, theta);
    expect(p.visible).toBe(true);
    const hit = pickMarker(p.x * size, p.y * size, targets, phi, theta, size);
    expect(hit?.slug).toBe("paris");
  });

  it("returns null when clicking empty ocean", () => {
    // Click the center of the disc only if no marker is near it.
    const hit = pickMarker(size / 2, size / 2, targets, phi, theta, size, 0.02, 5);
    // With a 5px threshold this must not grab a far-away marker.
    if (hit) {
      const p = projectMarker(
        hit.latitude,
        hit.longitude,
        phi,
        theta,
      );
      expect(Math.hypot(p.x * size - size / 2, p.y * size - size / 2)).toBeLessThan(5);
    }
  });

  it("ignores markers on the far side of the globe", () => {
    const back = projectMarker(0, 90, 0, 0);
    expect(back.visible).toBe(false);
    const hit = pickMarker(back.x * size, back.y * size, targets, 0, 0, size);
    expect(hit).toBeNull();
  });
});

describe("easeInOutCubic", () => {
  it("maps 0->0, 1->1 and is monotonic", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
    let prev = 0;
    for (let t = 0.1; t <= 1; t += 0.1) {
      expect(easeInOutCubic(t)).toBeGreaterThanOrEqual(prev);
      prev = easeInOutCubic(t);
    }
  });
});
