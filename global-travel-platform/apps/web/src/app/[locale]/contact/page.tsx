import { Card } from "@gtp/ui";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSiteConfig } from "@/lib/site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "contact" });
  return pageMetadata(locale, "/contact", { title: t("title"), description: t("intro") });
}

/** No contact form in Phase 1: email avoids storing messages (data minimisation). */
export default async function ContactPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("contact");
  const site = getSiteConfig();

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-display text-4xl font-semibold">{t("title")}</h1>
      <p className="mt-3 text-lg text-ink-muted">{t("intro")}</p>
      <dl className="mt-8 grid gap-6 sm:grid-cols-2">
        <Card>
          <dt className="text-sm font-semibold text-ink-muted">{t("emailLabel")}</dt>
          <dd className="mt-1">
            <a
              href={`mailto:${site.contactEmail}`}
              className="font-semibold text-brand-600 hover:underline"
            >
              {site.contactEmail}
            </a>
          </dd>
        </Card>
        <Card>
          <dt className="text-sm font-semibold text-ink-muted">{t("privacyLabel")}</dt>
          <dd className="mt-1">
            <a
              href={`mailto:${site.privacyEmail}`}
              className="font-semibold text-brand-600 hover:underline"
            >
              {site.privacyEmail}
            </a>
          </dd>
        </Card>
        {site.address && (
          <Card className="sm:col-span-2">
            <dt className="text-sm font-semibold text-ink-muted">{t("addressLabel")}</dt>
            <dd className="mt-1">
              {site.legalEntity}
              <br />
              {site.address}
            </dd>
          </Card>
        )}
      </dl>
      <p className="mt-4 text-sm text-ink-muted">{t("responseTime")}</p>
      <section className="mt-10 rounded-2xl border border-line bg-surface-2 p-6">
        <h2 className="font-display text-2xl font-semibold">{t("bookingTitle")}</h2>
        <p className="mt-2 leading-relaxed">{t("booking")}</p>
      </section>
    </div>
  );
}
