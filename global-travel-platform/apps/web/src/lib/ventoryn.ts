/**
 * Ventoryn Analytics — first-party, cookieless page analytics (https://ventoryn.app).
 * No cookies, no local storage, no personal data: it needs no consent prompt, so it
 * is not behind the ConsentBanner. The site id is a public identifier (it appears in
 * every page), configuration rather than a credential. VENTORYN_SITE_ID overrides the
 * default; VENTORYN_SITE_ID=off turns it off.
 */
export const VENTORYN_ORIGIN = "https://ventoryn.app";
const DEFAULT_SITE_ID = "4883942067d372e8b00a2709";

export function getVentorynSiteId(env: Partial<NodeJS.ProcessEnv> = process.env): string | null {
  const raw = (env.VENTORYN_SITE_ID ?? DEFAULT_SITE_ID).trim();
  if (raw === "" || raw.toLowerCase() === "off") return null;
  return /^[0-9a-f]{24}$/.test(raw) ? raw : null;
}
