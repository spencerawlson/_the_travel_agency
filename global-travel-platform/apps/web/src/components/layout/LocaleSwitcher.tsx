"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";

export function LocaleSwitcher() {
  const t = useTranslations("nav");
  const locale = useLocale();
  const pathname = usePathname();
  const params = useSearchParams();
  const other = locale === "en" ? "fr" : "en";
  const query = Object.fromEntries(params.entries());

  return (
    <Link
      href={{ pathname, query }}
      locale={other}
      hrefLang={other}
      lang={other}
      className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-ink hover:bg-surface-2"
      aria-label={`${t("language")}: ${t("switchTo")}`}
    >
      {t("switchTo")}
    </Link>
  );
}
