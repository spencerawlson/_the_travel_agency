import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Server-side URL of the FastAPI service (Docker network / localhost in dev).
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

// Content-Security-Policy is set per request in src/proxy.ts (see src/lib/csp.ts),
// so runtime settings such as an enabled partner script apply without a rebuild.
const securityHeaders = [
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
