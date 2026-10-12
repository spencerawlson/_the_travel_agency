import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { SiteConfig } from "@/lib/site";
import { CookieSettingsButton } from "../ConsentBanner";

const linkClass = "text-sm text-ink-muted hover:text-ink";

export async function Footer({ site }: { site: SiteConfig }) {
  const t = await getTranslations("footer");
  const nav = await getTranslations("nav");
  const legal = await getTranslations("legal");
  return (
    <footer className="border-t border-line bg-surface-1">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="font-display text-lg font-semibold">{site.name}</p>
          <p className="mt-1 font-display text-base text-accent-600 italic">{t("tagline")}</p>
          <p className="mt-2 text-sm text-ink-muted">{t("about")}</p>
        </div>
        <FooterColumn
          title={t("explore")}
          links={[
            ["/destinations", nav("destinations")],
            ["/deals", nav("deals")],
          ]}
        />
        <FooterColumn
          title={t("company")}
          links={[
            ["/about", nav("about")],
            ["/contact", nav("contact")],
            ["/credits", t("credits")],
          ]}
        />
        <FooterColumn
          title={t("legal")}
          links={[
            ["/legal/privacy", legal("privacy")],
            ["/legal/terms", legal("terms")],
            ["/legal/affiliate-disclosure", legal("affiliate")],
          ]}
        />
      </div>
      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl space-y-1 px-4 py-4 text-xs text-ink-muted">
          <p>{t("disclosure")}</p>
          {site.partnerScript && (
            <p>
              <CookieSettingsButton className="underline hover:text-ink" />
            </p>
          )}
          <p>{t("rights", { year: new Date().getFullYear(), entity: site.legalEntity })}</p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2">
        {links.map(([href, label]) => (
          <li key={href}>
            <Link className={linkClass} href={href}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
