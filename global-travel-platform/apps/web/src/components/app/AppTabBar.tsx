"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Link, usePathname } from "@/i18n/navigation";

/**
 * App-only bottom navigation (see lib/app-shell.ts). A floating pill bar in
 * the shape of the reference iOS structure: Home, Flights, Explore, Saved,
 * Profile. Profile is the settings and info hub (language, saved trips,
 * deals, about, contact, legal, cookie settings) — Farelune has no accounts,
 * so it is deliberately not an account page. Colours stay the site's own.
 */

const TABS = [
  { href: "/", key: "home", icon: <HomeIcon /> },
  { href: "/flights", key: "flights", icon: <SearchIcon /> },
  { href: "/destinations", key: "explore", icon: <CompassIcon /> },
  { href: "/saved-trips", key: "saved", icon: <HeartIcon /> },
  { href: "/profile", key: "profile", icon: <PersonIcon /> },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppTabBar() {
  const t = useTranslations("nav");
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("primary")}
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-40 mx-auto max-w-xl rounded-full bg-surface-1/95 shadow-lg ring-1 ring-line backdrop-blur-md"
    >
      <ul className="grid h-[var(--app-tabbar-h)] grid-cols-5">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          return (
            <li key={tab.key} className="contents">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 text-[11px] focus-visible:outline-2 focus-visible:-outline-offset-2 ${
                  active ? "font-bold text-brand-600" : "font-medium text-ink-muted"
                }`}
              >
                {tab.icon}
                {t(tab.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
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

function SearchIcon() {
  return (
    <Icon>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </Icon>
  );
}

function CompassIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.5 8.5-2.5 4.5-4.5 2.5 2.5-4.5z" />
    </Icon>
  );
}

function HeartIcon() {
  return (
    <Icon>
      <path d="M12 20.5C7 16.5 3.5 13.3 3.5 9.6 3.5 7 5.5 5 8 5c1.5 0 3 .8 4 2.1C13 5.8 14.5 5 16 5c2.5 0 4.5 2 4.5 4.6 0 3.7-3.5 6.9-8.5 10.9z" />
    </Icon>
  );
}

function PersonIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.3 3.1-5 7-5s7 1.7 7 5" />
    </Icon>
  );
}
