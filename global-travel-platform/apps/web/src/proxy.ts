import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Locale negotiation (Accept-Language + NEXT_LOCALE cookie) and prefix redirects.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and static files.
  matcher: ["/((?!api|_next|_vercel|.*\..*).*)"],
};
