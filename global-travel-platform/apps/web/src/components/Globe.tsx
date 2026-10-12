"use client";

import createGlobe, { type Globe as CobeGlobe } from "cobe";
import { useEffect, useRef } from "react";

export interface GlobePoint {
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
}

interface Props {
  points: GlobePoint[];
  hub: { latitude: number; longitude: number };
  label: string;
}

const AUTO_SPEED = 0.0028; // radians per frame (~one turn every 37 s at 60 fps)

/**
 * Slowly rotating 3D globe (WebGL via cobe, ~5 KB, no external assets) with a
 * marker per destination and flight arcs from the home hub. Drag to spin.
 * Pauses off-screen; static when the visitor prefers reduced motion. If WebGL
 * is unavailable the CSS sphere behind the canvas still shows.
 */
export function Globe({ points, hub, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Start facing the Atlantic so Montréal and Europe are both visible.
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
        mapSamples: 16000,
        mapBrightness: 5.5,
        mapBaseBrightness: 0.05,
        baseColor: [0.93, 0.96, 1],
        markerColor: [1, 0.45, 0.3],
        glowColor: [0.86, 0.93, 1],
        markers: [
          { location: [hub.latitude, hub.longitude], size: 0.09, color: [0.1, 0.45, 0.9] },
          ...points.map((p) => ({
            location: [p.latitude, p.longitude] as [number, number],
            size: 0.06,
            id: p.slug,
          })),
        ],
        arcs: points.map((p) => ({
          from: [hub.latitude, hub.longitude] as [number, number],
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
        globe.update({ phi });
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
