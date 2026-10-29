"use client";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { AppTrackingTransparency } from "@capgo/capacitor-app-tracking-transparency";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

import { ATT_ASKED_KEY } from "@/lib/saved-trips";

/**
 * App-only behaviour (see lib/app-shell.ts):
 * - hides the native splash screen once the page has rendered (Capacitor
 *   injects window.Capacitor into the WebView; the splash otherwise waits out
 *   launchShowDuration in capacitor.config.ts);
 * - asks once for App Tracking Transparency (iOS), because the site's Meta
 *   pixel and Travelpayouts content count as tracking inside the WebView;
 * - pull-to-refresh when the page is scrolled to the top.
 */

declare global {
  interface Window {
    Capacitor?: {
      Plugins?: { SplashScreen?: { hide: (o?: { fadeOutDuration?: number }) => unknown } };
    };
  }
}

/** Pull distance (CSS px, after resistance) that triggers a reload on release. */
export const PULL_THRESHOLD = 72;
const MAX_PULL = 110;
// Touches that start on these keep their own gesture (globe drag, open lists, sheets).
const IGNORE = "canvas, [role=listbox], [role=dialog], .app-sheet, input, select, textarea";

export function AppRuntime() {
  const t = useTranslations("app");
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRef = useRef(0);

  useEffect(() => {
    try {
      void window.Capacitor?.Plugins?.SplashScreen?.hide({ fadeOutDuration: 250 });
    } catch {
      // Not in the native shell, or the plugin is missing: nothing to hide.
    }
  }, []);

  // App Tracking Transparency: the site's Meta pixel and Travelpayouts
  // content share visit data with third parties, which Apple counts as
  // tracking when it fires inside the app's WebView. Ask once, natively,
  // on first launch; the system dialog itself only ever appears once, and
  // a denied answer is respected (the user can change it in iOS Settings).
  // Nothing here gates app behaviour on the answer.
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "ios") return;
    void (async () => {
      try {
        const asked = await Preferences.get({ key: ATT_ASKED_KEY });
        if (asked.value) return;
        const status = await AppTrackingTransparency.getStatus();
        if (status.status === "notDetermined") {
          await AppTrackingTransparency.requestPermission();
        }
        await Preferences.set({ key: ATT_ASKED_KEY, value: "1" });
      } catch {
        // ATT unavailable (older iOS, Simulator): tracking stays off by
        // default and the app keeps working.
      }
    })();
  }, []);

  useEffect(() => {
    let startY: number | null = null;
    let frame = 0;
    const set = (v: number) => {
      pullRef.current = v;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setPull(v));
    };
    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      const touch = e.touches.length === 1 ? e.touches[0] : undefined;
      startY = touch && window.scrollY <= 0 && !target?.closest?.(IGNORE) ? touch.clientY : null;
    };
    const onMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (startY === null || !touch) return;
      const dy = touch.clientY - startY;
      if (dy <= 0 || window.scrollY > 0) return set(0);
      // Resistance: the indicator moves at half speed and stops at MAX_PULL.
      set(Math.min(MAX_PULL, dy * 0.5));
    };
    const onEnd = () => {
      if (startY !== null && pullRef.current >= PULL_THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
      } else {
        set(0);
      }
      startY = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const shown = refreshing ? PULL_THRESHOLD : pull;
  const ready = refreshing || pull >= PULL_THRESHOLD;
  return (
    <div
      role="status"
      aria-live="polite"
      className="app-ptr pointer-events-none fixed inset-x-0 z-50 flex justify-center"
      style={{ transform: `translateY(${shown - 44}px)`, opacity: shown > 8 ? 1 : 0 }}
    >
      <span className="flex items-center gap-2 rounded-full bg-surface-1 px-3.5 py-2 text-xs font-semibold text-ink shadow-lg ring-1 ring-line">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className={refreshing ? "animate-spin text-brand-600" : "text-brand-600"}
          style={refreshing ? undefined : { transform: `rotate(${ready ? 180 : 0}deg)` }}
        >
          {refreshing ? <path d="M21 12a9 9 0 1 1-6.2-8.6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
        </svg>
        {shown > 8 &&
          (refreshing ? t("refreshing") : ready ? t("releaseToRefresh") : t("pullToRefresh"))}
      </span>
    </div>
  );
}
