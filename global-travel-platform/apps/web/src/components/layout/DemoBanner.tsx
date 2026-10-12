import { getTranslations } from "next-intl/server";
import { isDemoMode } from "@/lib/server-api";

/** Site-wide notice shown whenever the API reports demo mode (mock provider only). */
export async function DemoBanner() {
  if (!(await isDemoMode())) return null;
  const t = await getTranslations("demo");
  return (
    <div
      role="note"
      className="border-b border-amber-300 bg-amber-50 px-4 py-1.5 text-center text-xs font-medium text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
    >
      <span className="hidden sm:inline">{t("banner")}</span>
      <span className="sm:hidden">{t("bannerShort")}</span>
    </div>
  );
}
