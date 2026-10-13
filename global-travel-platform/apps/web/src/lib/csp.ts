import { WIDGET_CSP } from "./widgets";

/**
 * Content-Security-Policy, built per request in src/proxy.ts so runtime settings
 * (e.g. an enabled partner script) apply without rebuilding.
 *
 * Next.js injects small inline bootstrap scripts, so script-src needs
 * 'unsafe-inline'; a nonce-based CSP is tracked in docs/ROADMAP.md.
 * No `upgrade-insecure-requests`: it breaks plain-HTTP deployments (LAN, CI);
 * HTTPS is enforced by HSTS + Cloudflare/Nginx redirects in production.
 */
export function buildCsp({
  dev,
  partnerHosts = [],
  widgets = false,
}: {
  dev: boolean;
  partnerHosts?: string[];
  /** Allow the Travelpayouts brand widgets (lib/widgets.ts). */
  widgets?: boolean;
}) {
  const hosts = (list: readonly string[]) => list.map((h) => `https://${h}`);
  const add = (base: string, extra: readonly string[] = []) =>
    [base, ...hosts(partnerHosts), ...hosts(widgets ? extra : [])].join(" ");
  return [
    "default-src 'self'",
    add(`script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`, WIDGET_CSP.script),
    "style-src 'self' 'unsafe-inline'",
    add("img-src 'self' data:", WIDGET_CSP.img),
    "font-src 'self' data:",
    add(`connect-src 'self'${dev ? " ws: http://localhost:*" : ""}`, WIDGET_CSP.connect),
    ...(widgets ? [`frame-src ${hosts(WIDGET_CSP.frame).join(" ")}`] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
