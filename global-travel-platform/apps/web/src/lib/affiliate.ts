/**
 * Optional Travelpayouts (Drive/Emerald) partner script. OFF unless
 * TRAVELPAYOUTS_SCRIPT_ID is set. Read at runtime, so it can be switched on/off
 * by editing .env and restarting the web container (no rebuild).
 *
 * The loader is rendered inert (type="text/plain") in every page so partner
 * site verification can find it, and is only executed after the visitor
 * consents to partner cookies (see ConsentBanner).
 */
export interface AffiliateScript {
  id: string;
  host: string;
  src: string;
  /** Loader code, identical to the snippet from the Travelpayouts dashboard. */
  code: string;
}

/**
 * Extra hosts the Drive script reaches once running (observed on the live site):
 * its config/auth endpoints, its tooltip stylesheet and the Google Fonts it uses.
 */
export const DRIVE_CSP = {
  connect: ["emrld.cc", "mn-tz.com", "www.travelpayouts.com"],
  style: ["fonts.googleapis.com"],
  font: ["fonts.gstatic.com"],
} as const;

const ID_RE = /^\d{3,12}$/;
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function getAffiliateScript(
  env: Record<string, string | undefined> = process.env,
): AffiliateScript | null {
  const id = env.TRAVELPAYOUTS_SCRIPT_ID?.trim();
  const host = (env.TRAVELPAYOUTS_SCRIPT_HOST?.trim() || "emrldtp.cc").toLowerCase();
  if (!id || !ID_RE.test(id) || !HOST_RE.test(host)) return null;
  const src = `https://${host}/${Buffer.from(id).toString("base64")}.js?t=${id}`;
  const code =
    "(function () {" +
    'var script = document.createElement("script");' +
    "script.async = 1;" +
    'script.setAttribute("data-cmp-ab", "2");' +
    `script.src = '${src}';` +
    "document.head.appendChild(script);" +
    "})();";
  return { id, host, src, code };
}
