/**
 * Optional Meta (Facebook) Pixel. OFF unless META_PIXEL_ID is set.
 * The pixel ID is a public identifier (it appears in every page that runs the
 * pixel); it is configuration, not a credential.
 */
export function getMetaPixelId(env: Partial<NodeJS.ProcessEnv> = process.env): string | null {
  const id = (env.META_PIXEL_ID || "").trim();
  return /^\d+$/.test(id) ? id : null;
}

/** Extra hosts the pixel reaches once running (see lib/csp.ts). */
export const META_CSP = {
  script: ["connect.facebook.net"],
  connect: ["www.facebook.com"],
  img: ["www.facebook.com"],
} as const;

/** Hosts whose outbound clicks count as "went on to a booking partner". */
const PARTNER_HOST_SUFFIXES = [
  "aviasales.com",
  "kiwi.com",
  "klook.com",
  "airhelp.com",
  "travelpayouts.com",
];

export function isPartnerHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return PARTNER_HOST_SUFFIXES.some((s) => h === s || h.endsWith(`.${s}`));
}
