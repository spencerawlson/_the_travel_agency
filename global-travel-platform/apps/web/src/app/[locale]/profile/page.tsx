import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { CookieSettingsButton } from "@/components/ConsentBanner";
import { LocaleSwitcher } from "@/components/layout/LocaleSwitcher";
import { Link } from "@/i18n/navigation";
import { getAffiliateScript } from "@/lib/affiliate";
import { getMetaPixelId } from "@/lib/meta";
import { getSiteConfig } from "@/lib/site";

/**
 * App tab hub: language, saved trips, deals, company and legal pages, cookie
 * settings. Farelune has no accounts, so this is settings and info — not an
 * account page, and it never asks for sign-in. Reachable on the web too, but
 * only the app tab bar links here.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  return { title: t("profileTitle"), robots: { index: false, follow: false } };
}

export default async function ProfilePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "app" });
  const nav = await getTranslations({ locale, namespace: "nav" });
  const footer = await getTranslations({ locale, namespace: "footer" });
  const legal = await getTranslations({ locale, namespace: "legal" });
  const site = getSiteConfig();
  const consentBanner = Boolean(
    getAffiliateScript() || site.partnerWidgets || getMetaPixelId(),
  );

  const links: [string, string][] = [
    ["/saved-trips", t("savedTrips")],
    ["/deals", nav("deals")],
    ["/about", nav("about")],
    ["/contact", nav("contact")],
    ["/credits", footer("credits")],
    ["/legal/privacy", legal("privacy")],
    ["/legal/terms", legal("terms")],
    ["/legal/affiliate-disclosure", legal("affiliate")],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="font-display text-3xl font-semibold">{t("profileTitle")}</h1>
      <p className="mt-2 text-ink-muted">{t("profileNote")}</p>
      <div className="mt-6 flex items-center justify-between rounded-2xl border border-line bg-surface-1 px-4 py-3">
        <span className="font-medium">{nav("language")}</span>
        <LocaleSwitcher />
      </div>
      <ul className="mt-4 grid gap-1">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link
              href={href}
              className="block rounded-xl px-3 py-3 font-medium hover:bg-surface-2"
            >
              {label}
            </Link>
          </li>
        ))}
        {consentBanner && (
          <li>
            <CookieSettingsButton className="block w-full rounded-xl px-3 py-3 text-left font-medium hover:bg-surface-2" />
          </li>
        )}
      </ul>
      <div className="mt-6 space-y-1 border-t border-line px-3 pt-4 text-xs text-ink-muted">
        <p>{footer("disclosure")}</p>
        <p>
          {site.name} ·{" "}
          {footer("rights", { year: new Date().getFullYear(), entity: site.legalEntity })}
        </p>
      </div>
    </div>
  );
}
