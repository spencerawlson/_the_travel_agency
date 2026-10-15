import { DRIVE_CSP } from "./affiliate";
import { META_CSP } from "./meta";
import { WIDGET_CSP } from "./widgets";

/**
 * Content-Security-Policy, built per request in src/proxy.ts so runtime settings
 * (e.g. an enabled partner script) apply without rebuilding.
 *
 * Scripts: a fresh nonce per request plus 'strict-dynamic'. Next.js puts the
 * nonce on its own scripts (it reads it from the request's CSP header); scripts
 * those load (partner loaders, widgets) inherit trust. Injected inline script
 * without the nonce never runs. Host entries stay as a fallback for browsers
 * without 'strict-dynamic' (CSP3 browsers ignore them).
 * No `upgrade-insecure-requests`: it breaks plain-HTTP deployments (LAN, CI);
 * HTTPS is enforced by HSTS + Cloudflare/Nginx redirects in production.
 */
export function buildCsp({
  dev,
  partnerHosts = [],
  widgets = false,
  meta = false,
  nonce,
}: {
  dev: boolean;
  /** Per-request nonce (src/proxy.ts). Without it, falls back to 'unsafe-inline'. */
  nonce?: string;
  partnerHosts?: string[];
  /** Allow the Travelpayouts brand widgets (lib/widgets.ts). */
  widgets?: boolean;
  /** Allow the Meta Pixel hosts (lib/meta.ts). */
  meta?: boolean;
}) {
  const drive = partnerHosts.length > 0;
  const hosts = (list: readonly string[]) => list.map((h) => `https://${h}`);
  const add = (
    base: string,
    extra: readonly string[] = [],
    driveExtra: readonly string[] = [],
    metaExtra: readonly string[] = [],
  ) =>
    [
      base,
      ...hosts(partnerHosts),
      ...hosts(widgets ? extra : []),
      ...hosts(drive ? driveExtra : []),
      ...(meta ? hosts(metaExtra) : []),
    ].join(" ");
  const only = (base: string, driveExtra: readonly string[]) =>
    [base, ...hosts(drive ? driveExtra : [])].join(" ");
  return [
    "default-src 'self'",
    add(
      `script-src 'self' ${nonce ? `'nonce-${nonce}' 'strict-dynamic'` : "'unsafe-inline'"}${
        dev ? " 'unsafe-eval'" : ""
      }`,
      WIDGET_CSP.script,
      [],
      META_CSP.script,
    ),
    // Partner hosts here too: the Drive script loads its own tooltip stylesheet.
    drive
      ? add("style-src 'self' 'unsafe-inline'", [], DRIVE_CSP.style)
      : "style-src 'self' 'unsafe-inline'",
    add("img-src 'self' data:", WIDGET_CSP.img, [], META_CSP.img),
    only("font-src 'self' data:", DRIVE_CSP.font),
    add(
      `connect-src 'self'${dev ? " ws: http://localhost:*" : ""}`,
      WIDGET_CSP.connect,
      DRIVE_CSP.connect,
      META_CSP.connect,
    ),
    ...(widgets ? [`frame-src ${hosts(WIDGET_CSP.frame).join(" ")}`] : []),
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
