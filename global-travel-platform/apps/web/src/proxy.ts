import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { getAffiliateScript } from "./lib/affiliate";
import { buildCsp } from "./lib/csp";
import { getWidgetIds } from "./lib/widgets";
import { COUNTRY_ORIGIN } from "./content/origin-airports";

// Locale negotiation (Accept-Language + NEXT_LOCALE cookie) and prefix redirects.
const intl = createMiddleware(routing);

const ORIGIN_COOKIE = "gtp_origin";
const IATA_RE = /^[A-Z]{3}$/;

/**
 * Visitor origin detection: Cloudflare's edge adds `cf-ipcountry` before the
 * request reaches us through the tunnel. Map it to the country's primary
 * airport and remember it in a cookie — unless the visitor already chose an
 * origin in the search form (their choice wins).
 */
function detectOrigin(request: NextRequest): string | null {
  const existing = request.cookies.get(ORIGIN_COOKIE)?.value;
  if (existing && IATA_RE.test(existing)) return null; // visitor's choice stands
  const country = request.headers.get("cf-ipcountry");
  if (!country) return null;
  const match = COUNTRY_ORIGIN[country.toUpperCase()];
  return match ? match.iata : null;
}

export default function proxy(request: NextRequest) {
  // Fresh nonce per request. Next.js reads it from the request's CSP header and
  // adds it to its own scripts; next-intl forwards these request headers.
  const nonce = btoa(crypto.randomUUID());
  const partner = getAffiliateScript();
  const csp = buildCsp({
    dev: process.env.NODE_ENV !== "production",
    partnerHosts: partner ? [partner.host] : [],
    widgets: getWidgetIds() !== null,
    nonce,
  });
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const response = intl(request);
  const detected = detectOrigin(request);
  if (detected) {
    response.cookies.set(ORIGIN_COOKIE, detected, {
      maxAge: 365 * 24 * 3600,
      path: "/",
      sameSite: "lax",
    });
  }
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // All pages; skip API routes, Next internals and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
