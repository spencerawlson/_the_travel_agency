"use client";

import type CreateGlobeFn from "cobe";
import type { Globe as CobeGlobe } from "cobe";
import { useEffect, useRef } from "react";
import { globeQuality } from "@/lib/globe-quality";

export interface GlobePoint {
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface Props {
  points: GlobePoint[];
  /** Visitor's origin; null = unknown (markers only, no routes). */
  hub: { latitude: number; longitude: number } | null;
  label: string;
}

type CreateGlobe = typeof CreateGlobeFn;

const AUTO_SPEED = 0.0028; // radians per frame (~one turn every 37 s at 60 fps)

/**
 * Slowly rotating 3D globe (WebGL via cobe, ~5 KB, lazy-loaded when idle) with a
 * marker per destination and flight arcs from the home hub. Drag to spin.
 * Pauses off-screen; static when the visitor prefers reduced motion. If WebGL
 * is unavailable the CSS sphere behind the canvas still shows.
 */
export function Globe({ points, hub, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let teardown: (() => void) | undefined;
    // Load + start WebGL only once the browser is idle, so the globe never
    // competes with the hero photo and first interaction (LCP / TBT).
    const run = () => {
      void import("cobe").then(({ default: createGlobe }) => {
        if (!cancelled) teardown = mountGlobe(canvas, createGlobe, points, hub);
      });
    };
    const idle = "requestIdleCallback" in window;
    const handle = idle
      ? window.requestIdleCallback(run, { timeout: 4000 })
      : window.setTimeout(run, 1500);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      teardown?.();
    };
  }, [points, hub]);

  return (
    <div className="relative aspect-square w-full">
      {/* Soft halo + fallback sphere (visible before WebGL paints, or without WebGL). */}
      <div aria-hidden className="globe-fallback absolute inset-[6%] rounded-full" />
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        className="relative size-full cursor-grab touch-pan-y opacity-0 transition-opacity duration-700"
      />
    </div>
  );
}

/** Creates the globe on `canvas`; returns its teardown, or undefined without WebGL. */
function mountGlobe(
  canvas: HTMLCanvasElement,
  createGlobe: CreateGlobe,
  points: GlobePoint[],
  hub: Props["hub"],
): (() => void) | undefined {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { dpr, mapSamples, frameInterval } = globeQuality();
  let frameNo = 0;

  // Start facing the Atlantic (Americas + Europe/Africa in view).
  let phi = 4.6;
  let velocity = 0;
  let dragX: number | null = null;
  let visible = true;
  let frame = 0;
  let size = canvas.offsetWidth;

  let globe: CobeGlobe;
  try {
    globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi,
      theta: 0.28,
      dark: 0,
      diffuse: 1.15,
      mapSamples,
      mapBrightness: 5.5,
      mapBaseBrightness: 0.05,
      baseColor: [0.93, 0.96, 1],
      markerColor: [1, 0.45, 0.3],
      glowColor: [0.86, 0.93, 1],
      markers: [
        ...(hub
          ? [
              {
                location: [hub.latitude, hub.longitude] as [number, number],
                size: 0.09,
                color: [0.1, 0.45, 0.9] as [number, number, number],
              },
            ]
          : []),
        ...points.map((p) => ({
          location: [p.latitude, p.longitude] as [number, number],
          size: 0.06,
          id: p.slug,
        })),
      ],
      arcs: (hub ? points : []).map((p) => ({
        from: [hub!.latitude, hub!.longitude] as [number, number],
        to: [p.latitude, p.longitude] as [number, number],
      })),
      arcColor: [0.18, 0.5, 0.95],
      arcWidth: 0.6,
      arcHeight: 0.25,
      markerElevation: 0.02,
    });
  } catch {
    return; // no WebGL: CSS fallback sphere remains visible
  }

  const tick = () => {
    if (visible) {
      if (dragX === null) {
        velocity *= 0.95;
        phi += (reduceMotion ? 0 : AUTO_SPEED) + velocity;
      }
      // Phones redraw every other frame while idle; dragging stays smooth.
      if (dragX !== null || ++frameNo % frameInterval === 0) globe.update({ phi });
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  canvas.style.opacity = "1";

  const io = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
  });
  io.observe(canvas);

  const ro = new ResizeObserver(() => {
    size = canvas.offsetWidth;
    globe.update({ width: size * dpr, height: size * dpr });
  });
  ro.observe(canvas);

  const onDown = (e: PointerEvent) => {
    dragX = e.clientX;
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = "grabbing";
  };
  const onMove = (e: PointerEvent) => {
    if (dragX === null) return;
    const delta = (e.clientX - dragX) / 200;
    phi += delta;
    velocity = delta * 0.2;
    dragX = e.clientX;
  };
  const onUp = () => {
    dragX = null;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);

  return () => {
    cancelAnimationFrame(frame);
    io.disconnect();
    ro.disconnect();
    canvas.removeEventListener("pointerdown", onDown);
    canvas.removeEventListener("pointermove", onMove);
    canvas.removeEventListener("pointerup", onUp);
    canvas.removeEventListener("pointercancel", onUp);
    globe.destroy();
  };
}
