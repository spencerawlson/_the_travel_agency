import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("notFound");
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="font-mono text-sm text-ink-muted">404</p>
      <h1 className="mt-2 font-display text-4xl font-semibold">{t("title")}</h1>
      <p className="mt-3 text-ink-muted">{t("body")}</p>
      <Link
        href="/"
        className="mt-6 inline-block font-semibold text-brand-600 hover:underline dark:text-brand-300"
      >
        {t("home")}
      </Link>
    </div>
  );
}
