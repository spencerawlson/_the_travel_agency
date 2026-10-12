import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Server-side URL of the FastAPI service (Docker network / localhost in dev).
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:8000";
const isDev = process.env.NODE_ENV !== "production";

// Phase 1 CSP. Next.js and next-themes inject small inline bootstrap scripts, so
// script-src needs 'unsafe-inline'; moving to nonce-based CSP is tracked in
// docs/ROADMAP.md. Everything else is locked to 'self'.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // No `upgrade-insecure-requests`: it breaks plain-HTTP deployments (LAN, CI).
  // HTTPS is enforced by HSTS + Cloudflare/Nginx redirects in production.
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

// Monorepo root, so standalone output traces workspace packages (@gtp/*).
const monorepoRoot = path.resolve(process.cwd(), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ["@gtp/ui", "@gtp/shared-types"],
  async rewrites() {
    // Same-origin API: the browser only ever talks to this host. In production
    // Nginx routes /api directly to FastAPI, and this rewrite is a fallback.
    return [{ source: "/api/:path*", destination: `${apiInternalUrl}/api/:path*` }];
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
