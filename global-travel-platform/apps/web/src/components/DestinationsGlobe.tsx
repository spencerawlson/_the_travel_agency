"use client";

import type CreateGlobeFn from "cobe";
import type { Globe as CobeGlobe } from "cobe";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  arcPoint,
  easeInOutCubic,
  phiFacingRoute,
  pickMarker,
  projectMarker,
  projectPoint,
  shortestTurn,
  type PickTarget,
} from "@/lib/globe-math";
import { FLY_EVENT, type FlyRequest } from "@/lib/globe-events";

export interface FlyDestination extends PickTarget {
  name: string;
}

interface Props {
  locale: string;
  destinations: FlyDestination[];
  hub: { latitude: number; longitude: number };
  /** Departure city shown during a flight (null: unknown, no label). */
  hubName?: string | null;
}

type CreateGlobe = typeof CreateGlobeFn;

const AUTO_SPEED = 0.0022;
const FLIGHT_MS = 2100;
/** Turning the globe to face a route requested from the search box. */
const TURN_MS = 900;
const THETA = 0.28;
const MARKER_ELEVATION = 0.02;
const ARC_HEIGHT = 0.28;

/**
 * Interactive 3D globe for the destinations page. Drag to spin; clicking a
 * destination marker launches a little airplane that flies the arc from the
 * visitor's home airport to the destination, then opens its page.
 *
 * NOTE: next-intl's router prefixes the locale itself, so navigation targets
 * must NOT include the locale ("/destinations/paris", never "/en/...").
 */
export function DestinationsGlobe({ locale, destinations, hub, hubName = null }: Props) {
  const router = useRouter();
  const t = useTranslations("destinations");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef(new Map<string, HTMLDivElement>());
  const hubLabelRef = useRef<HTMLDivElement>(null);
  const [flyingTo, setFlyingTo] = useState<string | null>(null);

  const stateRef = useRef({
    phi: 4.4,
    velocity: 0,
    flying: null as null | { dest: FlyDestination; start: number },
    turning: null as null | { dest: FlyDestination; from: number; delta: number; start: number },
    reduceMotion: false,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const st = stateRef.current;
    st.reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    st.flying = null;
    st.turning = null;
    setFlyingTo(null);

    // Load and start WebGL only once the browser is idle, so the globe doesn't
    // block the first render (the CSS sphere shows until then). A search made
    // before it is ready simply opens the destination page.
    const mount = (createGlobe: CreateGlobe): (() => void) | undefined => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let size = canvas.offsetWidth;
      let visible = true;
      let frame = 0;
      let dragStart: { x: number; y: number } | null = null;
      let dragged = false;

      const targets: PickTarget[] = destinations;
      const hubLoc: [number, number] = [hub.latitude, hub.longitude];

      let globe: CobeGlobe;
      try {
        globe = createGlobe(canvas, {
          devicePixelRatio: dpr,
          width: size * dpr,
          height: size * dpr,
          phi: st.phi,
          theta: THETA,
          dark: 0,
          diffuse: 1.15,
          mapSamples: 16000,
          mapBrightness: 5.5,
          mapBaseBrightness: 0.05,
          baseColor: [0.93, 0.96, 1],
          markerColor: [1, 0.45, 0.3],
          glowColor: [0.86, 0.93, 1],
          markers: [
            { location: hubLoc, size: 0.09, color: [0.1, 0.45, 0.9] },
            ...destinations.map((d) => ({
              location: [d.latitude, d.longitude] as [number, number],
              size: 0.075,
              id: d.slug,
            })),
          ],
          arcs: destinations.map((d) => ({
            from: hubLoc,
            to: [d.latitude, d.longitude] as [number, number],
          })),
          arcColor: [0.18, 0.5, 0.95],
          arcWidth: 0.6,
          arcHeight: ARC_HEIGHT,
          markerElevation: MARKER_ELEVATION,
        });
      } catch {
        return; // no WebGL: country list below still works
      }

      /** next-intl prefixes the locale — push the bare path. */
      const goTo = (slug: string) => router.push(`/destinations/${slug}`);

      const startFlight = (dest: FlyDestination) => {
        if (st.reduceMotion) {
          goTo(dest.slug);
          return;
        }
        st.flying = { dest, start: performance.now() };
        setFlyingTo(dest.name);
        // Highlight only the active route during the flight.
        globe.update({
          arcs: [{ from: hubLoc, to: [dest.latitude, dest.longitude] as [number, number] }],
          arcColor: [1, 0.45, 0.3],
          arcWidth: 1.4,
        });
      };

      const tryPick = (clientX: number, clientY: number) => {
        const rect = canvas.getBoundingClientRect();
        const hit = pickMarker(
          clientX - rect.left,
          clientY - rect.top,
          targets,
          st.phi,
          THETA,
          rect.width,
          MARKER_ELEVATION,
        );
        if (hit) {
          const dest = destinations.find((d) => d.slug === hit.slug);
          if (dest) startFlight(dest);
        }
      };

      // Idle: labels that would overlap one already shown are hidden (the marker
      // stays clickable). During a flight only two names show: where the plane
      // leaves from and the destination.
      const LABEL_H = 22;
      const labelWidth = (name: string) => name.length * 6.5 + 22;
      const updateLabels = () => {
        const target = st.turning?.dest.slug ?? st.flying?.dest.slug;
        const hubEl = hubLabelRef.current;
        if (hubEl) {
          const hp = projectMarker(hubLoc[0], hubLoc[1], st.phi, THETA, MARKER_ELEVATION);
          hubEl.style.opacity = target && hp.visible ? "1" : "0";
          hubEl.style.left = `${hp.x * 100}%`;
          hubEl.style.top = `${hp.y * 100}%`;
        }
        const placed: { x: number; y: number; w: number }[] = [];
        for (const d of destinations) {
          const el = labelRefs.current.get(d.slug);
          if (!el) continue;
          const p = projectMarker(d.latitude, d.longitude, st.phi, THETA, MARKER_ELEVATION);
          const x = p.x * size;
          const y = p.y * size;
          const w = labelWidth(d.name);
          const clash = placed.some(
            (q) => Math.abs(q.x - x) < (q.w + w) / 2 && Math.abs(q.y - y) < LABEL_H,
          );
          const show = target ? d.slug === target && p.visible : p.visible && !clash;
          if (show) placed.push({ x, y, w });
          el.style.opacity = show ? "1" : "0";
          el.style.left = `${p.x * 100}%`;
          el.style.top = `${p.y * 100}%`;
        }
      };

      const tick = (now: number) => {
        if (visible) {
          const turn = st.turning;
          if (turn) {
            const k = easeInOutCubic(Math.min((now - turn.start) / TURN_MS, 1));
            st.phi = turn.from + turn.delta * k;
            if (k >= 1) {
              st.turning = null;
              startFlight(turn.dest);
            }
          }
          const fl = st.flying;
          if (turn) {
            // turning: phi already set above
          } else if (!fl) {
            if (dragStart === null) {
              st.velocity *= 0.95;
              st.phi += (st.reduceMotion ? 0 : AUTO_SPEED) + st.velocity;
            }
          } else {
            const rawT = Math.min((now - fl.start) / FLIGHT_MS, 1);
            const e = easeInOutCubic(rawT);
            const dest: [number, number] = [fl.dest.latitude, fl.dest.longitude];
            const pos = arcPoint(hubLoc, dest, e, MARKER_ELEVATION, ARC_HEIGHT);
            const proj = projectPoint(pos, st.phi, THETA);
            const ahead = arcPoint(
              hubLoc,
              dest,
              Math.min(e + 0.03, 1),
              MARKER_ELEVATION,
              ARC_HEIGHT,
            );
            const projAhead = projectPoint(ahead, st.phi, THETA);
            const plane = planeRef.current;
            if (plane) {
              const heading =
                (Math.atan2(projAhead.y - proj.y, projAhead.x - proj.x) * 180) / Math.PI;
              plane.style.opacity = "1";
              plane.style.left = `${proj.x * 100}%`;
              plane.style.top = `${proj.y * 100}%`;
              plane.style.transform = `translate(-50%, -50%) rotate(${heading + 45}deg)`;
            }
            if (rawT >= 1) {
              goTo(fl.dest.slug);
              return; // page navigates away; stop the loop
            }
          }
          globe.update({ phi: st.phi });
          updateLabels();
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      canvas.style.opacity = "1";
      updateLabels();

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
        if (st.flying) return;
        dragStart = { x: e.clientX, y: e.clientY };
        dragged = false;
        canvas.setPointerCapture(e.pointerId);
      };
      const onMove = (e: PointerEvent) => {
        if (dragStart === null || st.flying) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        if (Math.hypot(dx, dy) > 6) dragged = true;
        if (dragged) {
          const delta = (e.clientX - dragStart.x) / 200;
          st.phi += delta;
          st.velocity = delta * 0.2;
          dragStart = { x: e.clientX, y: e.clientY };
          canvas.style.cursor = "grabbing";
        } else {
          // Hover: pointer cursor when over a destination marker.
          const rect = canvas.getBoundingClientRect();
          const hit = pickMarker(
            e.clientX - rect.left,
            e.clientY - rect.top,
            targets,
            st.phi,
            THETA,
            rect.width,
            MARKER_ELEVATION,
          );
          canvas.style.cursor = hit ? "pointer" : "grab";
        }
      };
      const onUp = (e: PointerEvent) => {
        if (dragStart !== null && !dragged && !st.flying && !st.turning)
          tryPick(e.clientX, e.clientY);
        dragStart = null;
        dragged = false;
        canvas.style.cursor = "grab";
      };
      // Search box: "fly me to <slug>". Turn the globe to face the route first so
      // the plane is never on the far side, then fly as if the marker was clicked.
      const onFlyRequest = (e: Event) => {
        const req = (e as CustomEvent<FlyRequest>).detail;
        const dest = destinations.find((d) => d.slug === req.slug);
        if (!dest || st.reduceMotion || st.flying || st.turning) return;
        req.handled = true;
        canvas.scrollIntoView({ behavior: "smooth", block: "center" });
        visible = true;
        st.velocity = 0;
        const target = phiFacingRoute(hubLoc, [dest.latitude, dest.longitude]);
        st.turning = {
          dest,
          from: st.phi,
          delta: shortestTurn(st.phi, target),
          start: performance.now(),
        };
        setFlyingTo(dest.name);
      };
      window.addEventListener(FLY_EVENT, onFlyRequest);
      canvas.addEventListener("pointerdown", onDown);
      canvas.addEventListener("pointermove", onMove);
      canvas.addEventListener("pointerup", onUp);
      canvas.addEventListener("pointercancel", onUp);

      return () => {
        cancelAnimationFrame(frame);
        io.disconnect();
        ro.disconnect();
        window.removeEventListener(FLY_EVENT, onFlyRequest);
        canvas.removeEventListener("pointerdown", onDown);
        canvas.removeEventListener("pointermove", onMove);
        canvas.removeEventListener("pointerup", onUp);
        canvas.removeEventListener("pointercancel", onUp);
        globe.destroy();
      };
    };
    let cancelled = false;
    let teardown: (() => void) | undefined;
    const run = () => {
      void import("cobe").then(({ default: createGlobe }) => {
        if (!cancelled) teardown = mount(createGlobe);
      });
    };
    const idle = "requestIdleCallback" in window;
    const handle = idle
      ? window.requestIdleCallback(run, { timeout: 3000 })
      : window.setTimeout(run, 1200);
    return () => {
      cancelled = true;
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
      teardown?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinations, hub.latitude, hub.longitude, locale]);

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[560px]">
        <div aria-hidden className="globe-fallback absolute inset-[6%] rounded-full" />
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={t("globeLabel")}
          className="relative size-full cursor-grab touch-pan-y opacity-0 transition-opacity duration-700"
        />
        {/* Country name labels — positioned every frame to track the globe. */}
        {destinations.map((d) => (
          <div
            key={d.slug}
            ref={(el) => {
              if (el) labelRefs.current.set(d.slug, el);
              else labelRefs.current.delete(d.slug);
            }}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 -translate-x-1/2 -translate-y-[160%] rounded-full bg-ink/70 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white opacity-0 backdrop-blur-sm transition-opacity duration-200"
          >
            {d.name}
          </div>
        ))}
        {/* Departure city — shown only during a flight. */}
        {hubName && (
          <div
            ref={hubLabelRef}
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 -translate-x-1/2 -translate-y-[160%] rounded-full bg-brand-600/90 px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap text-white opacity-0 backdrop-blur-sm transition-opacity duration-200"
          >
            {hubName}
          </div>
        )}
        {/* The little airplane — positioned every frame during the flight. */}
        <div
          ref={planeRef}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 text-3xl opacity-0 drop-shadow-lg"
          style={{ transform: "translate(-50%, -50%)" }}
        >
          ✈️
        </div>
      </div>
      <p aria-live="polite" className="mt-3 text-center text-sm font-medium text-ink-muted">
        {flyingTo
          ? hubName
            ? t("flyingFromTo", { from: hubName, city: flyingTo })
            : t("flyingTo", { city: flyingTo })
          : t("globeHint")}
      </p>
    </div>
  );
}
