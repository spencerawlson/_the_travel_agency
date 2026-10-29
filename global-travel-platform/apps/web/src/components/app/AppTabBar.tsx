"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { CookieSettingsButton } from "../ConsentBanner";

/**
 * App-only bottom navigation (see lib/app-shell.ts). Replaces the header menu;
 * "More" opens a sheet with what the website keeps in its footer (company and
 * legal pages, cookie settings, the affiliate disclosure).
 */

const TABS = [
  { href: "/", key: "home", icon: <HomeIcon /> },
  { href: "/flights", key: "flights", icon: <PlaneIcon /> },
  { href: "/deals", key: "deals", icon: <TagIcon /> },
  { href: "/destinations", key: "destinations", icon: <GlobeIcon /> },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

const tabClass =
  "flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2";

export function AppTabBar({
  siteName,
  legalEntity,
  cookieSettings,
}: {
  siteName: string;
  legalEntity: string;
  cookieSettings: boolean;
}) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  // The sheet belongs to the page it was opened on, so navigating closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const moreOpen = openOn === pathname;
  const setMoreOpen = (open: boolean) => setOpenOn(open ? pathname : null);
  const sheetId = useId();

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  const moreActive = ["/about", "/contact", "/credits", "/legal"].some((p) =>
    isActive(pathname, p),
  );

  return (
    <>
      {moreOpen && (
        <MoreSheet
          id={sheetId}
          siteName={siteName}
          legalEntity={legalEntity}
          cookieSettings={cookieSettings}
          onClose={() => setMoreOpen(false)}
        />
      )}
      <nav
        aria-label={t("primary")}
        className="app-tabbar fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface-1/95 backdrop-blur-md"
      >
        <ul className="mx-auto grid h-[var(--app-tabbar-h)] max-w-xl grid-cols-5">
          {TABS.map((tab) => {
            const active = isActive(pathname, tab.href);
            return (
              <li key={tab.key} className="contents">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`${tabClass} ${active ? "text-brand-600" : "text-ink-muted"}`}
                >
                  {tab.icon}
                  {t(tab.key)}
                </Link>
              </li>
            );
          })}
          <li className="contents">
            <button
              type="button"
              aria-expanded={moreOpen}
              aria-controls={sheetId}
              onClick={() => setMoreOpen(!moreOpen)}
              className={`${tabClass} ${moreOpen || moreActive ? "text-brand-600" : "text-ink-muted"}`}
            >
              <MoreIcon />
              {t("more")}
            </button>
          </li>
        </ul>
      </nav>
    </>
  );
}

function MoreSheet({
  id,
  siteName,
  legalEntity,
  cookieSettings,
  onClose,
}: {
  id: string;
  siteName: string;
  legalEntity: string;
  cookieSettings: boolean;
  onClose: () => void;
}) {
  const nav = useTranslations("nav");
  const footer = useTranslations("footer");
  const legal = useTranslations("legal");
  const app = useTranslations("app");
  const links: [string, string][] = [
    ["/saved-trips", app("savedTrips")],
    ["/about", nav("about")],
    ["/contact", nav("contact")],
    ["/credits", footer("credits")],
    ["/legal/privacy", legal("privacy")],
    ["/legal/terms", legal("terms")],
    ["/legal/affiliate-disclosure", legal("affiliate")],
  ];
  return (
    <>
      <button
        type="button"
        aria-label={nav("close")}
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 z-30 bg-ink/30"
      />
      <section
        id={id}
        aria-label={nav("more")}
        className="app-sheet fixed inset-x-0 z-40 mx-auto max-w-xl rounded-t-3xl bg-surface-1 px-5 pt-5 pb-4 shadow-2xl ring-1 ring-line"
      >
        <ul className="grid gap-1">
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
          {cookieSettings && (
            <li>
              <CookieSettingsButton className="block w-full rounded-xl px-3 py-3 text-left font-medium hover:bg-surface-2" />
            </li>
          )}
        </ul>
        <div className="mt-3 space-y-1 border-t border-line px-3 pt-3 text-xs text-ink-muted">
          <p>{footer("disclosure")}</p>
          <p>
            {siteName} · {footer("rights", { year: new Date().getFullYear(), entity: legalEntity })}
          </p>
        </div>
      </section>
    </>
  );
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

function HomeIcon() {
  return (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9v11h5v-6h4v6h5V9" />
    </Icon>
  );
}

function PlaneIcon() {
  return (
    <Icon>
      <path
        fill="currentColor"
        stroke="none"
        d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5z"
      />
    </Icon>
  );
}

function TagIcon() {
  return (
    <Icon>
      <path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z" />
      <circle cx="8" cy="8" r="1.5" />
    </Icon>
  );
}

function GlobeIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </Icon>
  );
}

function MoreIcon() {
  return (
    <Icon>
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="19" cy="12" r="1.2" />
    </Icon>
  );
}
