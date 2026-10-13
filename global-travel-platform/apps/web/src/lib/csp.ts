import { DRIVE_CSP } from "./affiliate";
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
  const drive = partnerHosts.length > 0;
  const hosts = (list: readonly string[]) => list.map((h) => `https://${h}`);
  const add = (base: string, extra: readonly string[] = [], driveExtra: readonly string[] = []) =>
    [
      base,
      ...hosts(partnerHosts),
      ...hosts(widgets ? extra : []),
      ...hosts(drive ? driveExtra : []),
    ].join(" ");
  const only = (base: string, driveExtra: readonly string[]) =>
    [base, ...hosts(drive ? driveExtra : [])].join(" ");
  return [
    "default-src 'self'",
    add(`script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`, WIDGET_CSP.script),
    // Partner hosts here too: the Drive script loads its own tooltip stylesheet.
    drive
      ? add("style-src 'self' 'unsafe-inline'", [], DRIVE_CSP.style)
      : "style-src 'self' 'unsafe-inline'",
    add("img-src 'self' data:", WIDGET_CSP.img),
    only("font-src 'self' data:", DRIVE_CSP.font),
    add(
      `connect-src 'self'${dev ? " ws: http://localhost:*" : ""}`,
      WIDGET_CSP.connect,
      DRIVE_CSP.connect,
    ),
    ...(widgets ? [`frame-src ${hosts(WIDGET_CSP.frame).join(" ")}`] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
