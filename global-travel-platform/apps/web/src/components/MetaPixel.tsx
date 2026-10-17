"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useConsent } from "./ConsentBanner";
import { isPartnerHost } from "@/lib/meta";

/**
 * Meta (Facebook) Pixel, gated on the same opt-in consent as the partner
 * script (Québec Law 25): fbevents.js is only loaded after the visitor
 * accepts, and withdrawing consent stops further events in this session.
 *
 * Events: PageView on every route; ViewContent on a destination page;
 * Search when a flight search lands on /flights; a custom PartnerClick when
 * the visitor clicks out to a booking partner (Aviasales, Kiwi.com, ...).
 * Bookings complete on partner sites, so PartnerClick is the closest
 * on-site signal to a conversion and backs retargeting audiences.
 * Visits from the native apps carry `source: "app"` so they can be told apart.
 */

type Fbq = ((...args: unknown[]) => void) & {
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
};

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

const FBQ_SRC = "https://connect.facebook.net/en_US/fbevents.js";

function ensureFbq(pixelId: string): Fbq {
  if (window.fbq) return window.fbq;
  const fbq: Fbq = (...args: unknown[]) => {
    (fbq.queue ??= []).push(args);
  };
  fbq.queue = [];
  fbq.loaded = false;
  fbq.version = "2.0";
  window.fbq = fbq;
  // Loaded by first-party code, which the nonce + 'strict-dynamic' CSP trusts.
  const script = document.createElement("script");
  script.async = true;
  script.src = FBQ_SRC;
  document.head.appendChild(script);
  fbq("init", pixelId);
  return fbq;
}

export function trackMeta(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.fbq) return;
  if (params) window.fbq("track", event, params);
  else window.fbq("track", event);
}

export function trackMetaCustom(event: string, params?: Record<string, unknown>) {
  if (typeof window === "undefined" || !window.fbq) return;
  if (params) window.fbq("trackCustom", event, params);
  else window.fbq("trackCustom", event);
}

export function MetaPixel({ pixelId, inApp = false }: { pixelId: string; inApp?: boolean }) {
  const consent = useConsent();
  const pathname = usePathname();

  // Load + initialise once consent is granted.
  useEffect(() => {
    if (consent === "accepted") ensureFbq(pixelId);
  }, [consent, pixelId]);

  // PageView (and contextual events) on first view and every navigation.
  useEffect(() => {
    if (consent !== "accepted") return;
    ensureFbq(pixelId);
    if (inApp) trackMeta("PageView", { source: "app" });
    else trackMeta("PageView");
    const destination = pathname.match(/\/destinations\/([^/]+)$/);
    if (destination) {
      trackMeta("ViewContent", {
        content_type: "destination",
        content_ids: [destination[1]],
      });
    }
    if (/\/flights$/.test(pathname)) {
      const query = new URLSearchParams(window.location.search);
      const from = query.get("from");
      const to = query.get("to");
      if (from || to) {
        trackMeta("Search", {
          ...(from ? { origin: from } : {}),
          ...(to ? { destination: to } : {}),
        });
      }
    }
  }, [consent, pathname, pixelId, inApp]);

  // Outbound clicks to booking partners (delegated: covers cards and links
  // rendered anywhere in our own DOM).
  useEffect(() => {
    if (consent !== "accepted") return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      try {
        const url = new URL(anchor.href);
        if (url.origin !== window.location.origin && isPartnerHost(url.hostname)) {
          trackMetaCustom("PartnerClick", {
            partner: url.hostname,
            path: window.location.pathname,
          });
        }
      } catch {
        // Not a parseable URL; nothing to track.
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [consent]);

  return null;
}
