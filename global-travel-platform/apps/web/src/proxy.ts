import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { getAffiliateScript } from "./lib/affiliate";
import { buildCsp } from "./lib/csp";

// Locale negotiation (Accept-Language + NEXT_LOCALE cookie) and prefix redirects.
const intl = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const response = intl(request);
  const partner = getAffiliateScript();
  response.headers.set(
    "Content-Security-Policy",
    buildCsp({
      dev: process.env.NODE_ENV !== "production",
      partnerHosts: partner ? [partner.host] : [],
    }),
  );
  return response;
}

export const config = {
  // All pages; skip API routes, Next internals and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
