import type { Metadata } from "next";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import "../globals.css";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { routing } from "@/i18n/routing";
import { getSiteConfig } from "@/lib/site";

// Self-hosted at build time by next/font (no runtime requests to Google).
const heading = Fraunces({
  subsets: ["latin", "latin-ext"],
  variable: "--font-heading",
  display: "swap",
});
const body = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-body",
  display: "swap",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const site = getSiteConfig();
  return {
    title: { default: t("title", { site: site.name }), template: `%s | ${site.name}` },
    description: t("description"),
    alternates: { languages: { en: "/en", fr: "/fr" } },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations("nav");
  const site = getSiteConfig();

  return (
    <html lang={locale} suppressHydrationWarning className={`${heading.variable} ${body.variable}`}>
      <body className="flex min-h-dvh flex-col font-sans">
        <NextIntlClientProvider>
          <ThemeProvider>
            <a
              href="#main"
              className="sr-only z-50 rounded-lg bg-brand-600 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
            >
              {t("skip")}
            </a>
            <Header siteName={site.name} />
            <main id="main" className="flex-1">
              {children}
            </main>
            <Footer site={site} />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
