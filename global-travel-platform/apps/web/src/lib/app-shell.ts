/**
 * The iOS/Android apps (Capacitor, apps/web/capacitor.config.ts) load this site
 * and append this token to the WebView's user agent. When it is present the
 * layout switches to its app shell: bottom tab bar instead of the menu and
 * footer, a compact cookie prompt, pull-to-refresh and native splash hand-off.
 */
export const APP_UA_TOKEN = "FareluneApp";

export function isAppUserAgent(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && new RegExp(`\\b${APP_UA_TOKEN}/`).test(userAgent));
}
