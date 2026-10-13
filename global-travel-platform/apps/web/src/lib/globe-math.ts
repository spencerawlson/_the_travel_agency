/**
 * Globe math that mirrors cobe's internal projection exactly (see
 * node_modules/cobe/dist/index.esm.js: U() for lat/lng -> vec3, O() for the
 * rotation + orthographic projection, and the arc vertex shader's quadratic
 * bezier). Used for click-picking destination markers and for flying the
 * little airplane along the arc in screen space.
 */

export type Vec3 = [number, number, number];

/** cobe's U([lat, lng]): geographic coordinates -> unit sphere vector. */
export function latLngToVec(lat: number, lng: number): Vec3 {
  const r = (lat * Math.PI) / 180;
  const a = (lng * Math.PI) / 180 - Math.PI;
  const o = Math.cos(r);
  return [-o * Math.cos(a), Math.sin(r), o * Math.sin(a)];
}

export interface Projection {
  /** Fraction of canvas width (0..1). */
  x: number;
  /** Fraction of canvas height (0..1). */
  y: number;
  /** False when the point is on the far side of the globe. */
  visible: boolean;
}

/**
 * cobe's O(t): rotate a (pre-scaled) 3D point by phi/theta and project it
 * orthographically. Assumes a square canvas, offset [0,0], scale 1 —
 * exactly how our globes are configured.
 */
export function projectPoint(p: Vec3, phi: number, theta: number): Projection {
  const r = Math.cos(theta);
  const a = Math.cos(phi);
  const o = Math.sin(theta);
  const i = Math.sin(phi);
  const c = a * p[0] + i * p[2];
  const s = i * o * p[0] + r * p[1] - a * o * p[2];
  const z = -i * r * p[0] + o * p[1] + a * r * p[2];
  return {
    x: (c + 1) / 2,
    y: (-s + 1) / 2,
    visible: z >= 0 || c * c + s * s >= 0.64,
  };
}

/** Project a surface marker the way cobe draws it. */
export function projectMarker(
  lat: number,
  lng: number,
  phi: number,
  theta: number,
  markerElevation = 0.02,
): Projection {
  const v = latLngToVec(lat, lng);
  const k = 0.8 + markerElevation;
  return projectPoint([v[0] * k, v[1] * k, v[2] * k], phi, theta);
}

const GLOBE_RADIUS = 0.8;

/**
 * Point on the cobe-style flight arc between two locations at parameter t
 * (0 = departure, 1 = arrival), replicating the arc vertex shader's
 * quadratic bezier: endpoints sit at marker elevation, the control point is
 * the normalized midpoint raised by arcHeight.
 */
export function arcPoint(
  from: [number, number],
  to: [number, number],
  t: number,
  markerElevation = 0.02,
  arcHeight = 0.25,
): Vec3 {
  const k = GLOBE_RADIUS + markerElevation;
  const f = latLngToVec(from[0], from[1]);
  const g = latLngToVec(to[0], to[1]);
  const dx = f[0] * k;
  const dy = f[1] * k;
  const dz = f[2] * k;
  const ex = g[0] * k;
  const ey = g[1] * k;
  const ez = g[2] * k;
  const sx = f[0] + g[0];
  const sy = f[1] + g[1];
  const sz = f[2] + g[2];
  const len = Math.hypot(sx, sy, sz) || 1;
  const ch = GLOBE_RADIUS + arcHeight;
  const cx = (sx / len) * ch;
  const cy = (sy / len) * ch;
  const cz = (sz / len) * ch;
  const u = 1 - t;
  return [
    u * u * dx + 2 * u * t * cx + t * t * ex,
    u * u * dy + 2 * u * t * cy + t * t * ey,
    u * u * dz + 2 * u * t * cz + t * t * ez,
  ];
}

export interface PickTarget {
  slug: string;
  latitude: number;
  longitude: number;
}

/**
 * Find the nearest visible marker to a click (in CSS pixels). Returns null
 * when nothing is within `thresholdPx`.
 */
export function pickMarker(
  clickX: number,
  clickY: number,
  targets: PickTarget[],
  phi: number,
  theta: number,
  canvasSizePx: number,
  markerElevation = 0.02,
  thresholdPx = 34,
): PickTarget | null {
  let best: PickTarget | null = null;
  let bestDist = thresholdPx;
  for (const t of targets) {
    const p = projectMarker(t.latitude, t.longitude, phi, theta, markerElevation);
    if (!p.visible) continue;
    const dx = p.x * canvasSizePx - clickX;
    const dy = p.y * canvasSizePx - clickY;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

/** easeInOutCubic for the flight animation. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * The globe rotation (phi) that turns `v` to face the viewer, i.e. the inverse
 * of projectPoint's rotation about the vertical axis (latitude is ignored).
 */
export function phiFacing(v: Vec3): number {
  return Math.atan2(-v[0], v[2]);
}

/** Phi that centres the route between two [lat, lng] points. */
export function phiFacingRoute(from: [number, number], to: [number, number]): number {
  const a = latLngToVec(from[0], from[1]);
  const b = latLngToVec(to[0], to[1]);
  return phiFacing([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
}

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
export function shortestTurn(from: number, to: number): number {
  const d = (((to - from) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI);
  return d - Math.PI;
}
