import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { allPhotos, photoAlt } from "@/lib/photos";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "credits" });
  return pageMetadata(locale, "/credits", { title: t("title"), description: t("intro") });
}

/** Attribution for every photo used on the site (required by CC BY / CC BY-SA). */
export default async function CreditsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("credits");

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="font-display text-5xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-3 text-lg text-ink-muted">{t("intro")}</p>
      <ul className="mt-8 divide-y divide-line rounded-3xl bg-surface-1 ring-1 ring-line/60">
        {allPhotos().map(([key, p]) => (
          <li key={key} className="flex gap-4 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised static WebP */}
            <img
              src={p.srcSmall}
              alt=""
              width={120}
              height={80}
              loading="lazy"
              className="h-20 w-28 shrink-0 rounded-xl object-cover"
              style={{ objectPosition: p.focus }}
            />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{photoAlt(p, locale)}</p>
              <p className="mt-1 text-ink-muted">
                {t("by", { author: p.author })} ·{" "}
                {p.licenseUrl ? (
                  <a
                    href={p.licenseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    {p.license}
                  </a>
                ) : (
                  p.license
                )}
              </p>
              <a
                href={p.source}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-block truncate text-brand-600 underline"
              >
                {t("source")}
              </a>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-ink-muted">{t("note")}</p>
    </div>
  );
}
