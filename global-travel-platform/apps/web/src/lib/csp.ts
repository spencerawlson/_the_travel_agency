/**
 * Content-Security-Policy, built per request in src/proxy.ts so runtime settings
 * (e.g. an enabled partner script) apply without rebuilding.
 *
 * Next.js injects small inline bootstrap scripts, so script-src needs
 * 'unsafe-inline'; a nonce-based CSP is tracked in docs/ROADMAP.md.
 * No `upgrade-insecure-requests`: it breaks plain-HTTP deployments (LAN, CI);
 * HTTPS is enforced by HSTS + Cloudflare/Nginx redirects in production.
 */
export function buildCsp({ dev, partnerHosts = [] }: { dev: boolean; partnerHosts?: string[] }) {
  const partners = partnerHosts.map((h) => `https://${h}`).join(" ");
  const withPartners = (base: string) => (partners ? `${base} ${partners}` : base);
  return [
    "default-src 'self'",
    withPartners(`script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`),
    "style-src 'self' 'unsafe-inline'",
    withPartners("img-src 'self' data:"),
    "font-src 'self' data:",
    withPartners(`connect-src 'self'${dev ? " ws: http://localhost:*" : ""}`),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
