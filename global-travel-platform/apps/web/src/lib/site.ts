/**
 * Runtime site configuration (server-side). Values come from environment
 * variables so legal identity and contact details can change without a rebuild.
 * The default brand name is a PLACEHOLDER pending trademark clearance.
 */
import { getAffiliateScript } from "./affiliate";
import { getWidgetIds } from "./widgets";

export interface SiteConfig {
  name: string;
  legalEntity: string;
  contactEmail: string;
  privacyEmail: string;
  address: string;
  privacyOfficer: string;
  legalLastUpdated: string;
  /** Optional partner script enabled (TRAVELPAYOUTS_SCRIPT_ID). */
  partnerScript: boolean;
  /** Travelpayouts brand widgets (Klook, Kiwi.com) are enabled. */
  partnerWidgets: boolean;
  /** Partner booking links are live (REFERRALS_LIVE_ENABLED). */
  referralsLive: boolean;
}

export function getSiteConfig(): SiteConfig {
  const env = process.env;
  return {
    name: env.SITE_NAME || "Farelune",
    legalEntity: env.LEGAL_ENTITY_NAME || "[Legal entity name, to be confirmed]",
    contactEmail: env.CONTACT_EMAIL || "hello@farelune.com",
    privacyEmail: env.PRIVACY_EMAIL || "privacy@farelune.com",
    // Optional: when empty, public pages give the email address instead.
    address: env.LEGAL_ADDRESS || "",
    privacyOfficer:
      env.PRIVACY_OFFICER_TITLE || "Person in charge of the protection of personal information",
    legalLastUpdated: env.LEGAL_LAST_UPDATED || "2026-10-12",
    partnerScript: getAffiliateScript(env) !== null,
    partnerWidgets: getWidgetIds(env) !== null,
    referralsLive: (env.REFERRALS_LIVE_ENABLED || "").toLowerCase() === "true",
  };
}

/** Public canonical URL of the site (for sitemaps, canonical links, OG tags). */
export function siteUrl(): string {
  return (process.env.SITE_URL || "https://farelune.com").replace(/\/$/, "");
}

/** Server-side base URL for calling FastAPI directly (not through the browser). */
export function apiInternalUrl(): string {
  return process.env.API_INTERNAL_URL || "http://localhost:8000";
}
