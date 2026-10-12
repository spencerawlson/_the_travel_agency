import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { DemoBanner } from "./DemoBanner";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";

const NAV_ITEMS = [
  { href: "/", key: "home" },
  { href: "/destinations", key: "destinations" },
  { href: "/deals", key: "deals" },
  { href: "/about", key: "about" },
  { href: "/contact", key: "contact" },
] as const;

export async function Header({ siteName }: { siteName: string }) {
  const t = await getTranslations("nav");
  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-canvas/80 backdrop-blur-md">
      <DemoBanner />
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" aria-label={siteName} className="text-ink">
          <Logo name={siteName} />
        </Link>
        <nav aria-label={t("primary")} className="hidden md:block">
          <ul className="flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-2 hover:text-ink"
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex items-center gap-2">
          <Suspense fallback={null}>
            <LocaleSwitcher />
          </Suspense>
          <MobileNav items={NAV_ITEMS.map((i) => ({ href: i.href, label: t(i.key) }))} />
        </div>
      </div>
    </header>
  );
}
